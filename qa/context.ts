import "dotenv/config";
import fs from "fs";
import path from "path";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

export const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

export interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  notes: string;
}

export const testResults: TestResult[] = [];

export function recordResult(id: string, name: string, passed: boolean, notes: string) {
  testResults.push({ id, name, passed, notes });
  const status = passed ? "\x1b[32m✔ PASS\x1b[0m" : "\x1b[31m✘ FAIL\x1b[0m";
  console.log(`[${id}] ${name} - ${status} (${notes})`);
}

/** Jalankan satu kasus uji; error tak terduga dicatat sebagai FAIL, bukan crash. */
export async function runTest(
  id: string,
  name: string,
  fn: () => Promise<{ passed: boolean; notes: string }>
) {
  try {
    const { passed, notes } = await fn();
    recordResult(id, name, passed, notes);
  } catch (err) {
    recordResult(id, name, false, err instanceof Error ? err.message : String(err));
  }
}

export async function safeJson(res: Response) {
  try {
    return JSON.parse(await res.text());
  } catch {
    return null;
  }
}

// ── Akun seed (prisma/seed.ts, APP_MODE=saas) ─────────────────────────────
export const ACCOUNTS = {
  SUPER_ADMIN: { org: "demo", username: "superadmin", password: "admin123" },
  ADMIN_IT: { org: "demo", username: "admin_it", password: "admin123" },
  STAFF_IT: { org: "demo", username: "staff_it", password: "staff123" },
  ADMIN_IT_JAKARTA: { org: "demo", username: "admin_it_jakarta", password: "admin123" },
  ADMIN_KITCHEN: { org: "demo", username: "admin_kitchen", password: "admin123" },
  STAFF_KITCHEN: { org: "demo", username: "staff_kitchen", password: "staff123" },
  ADMIN_ENGINEERING: { org: "demo", username: "admin_engineering", password: "admin123" },
  TEKNISI_ENGINEERING: { org: "demo", username: "teknisi_engineering", password: "staff123" },
  B_SUPER_ADMIN: { org: "uji-b", username: "superadmin", password: "admin123" },
  B_ADMIN_IT: { org: "uji-b", username: "admin_it", password: "admin123" },
} as const;

export type AccountKey = keyof typeof ACCOUNTS;

const cookies: Partial<Record<AccountKey, string>> = {};

export function loginAs(orgCode: string, identifier: string, password: string) {
  return fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password, orgCode }),
  });
}

export function tokenCookie(res: Response): string | null {
  const match = res.headers.get("set-cookie")?.match(/token=([^;]+)/);
  return match ? `token=${match[1]}` : null;
}

export async function loginAll() {
  for (const key of Object.keys(ACCOUNTS) as AccountKey[]) {
    const account = ACCOUNTS[key];
    const res = await loginAs(account.org, account.username, account.password);
    const cookie = tokenCookie(res);
    if (!res.ok || !cookie) {
      throw new Error(
        `Login gagal untuk ${key} (${account.org}/${account.username}): status ${res.status}. ` +
          "Pastikan server berjalan dengan APP_MODE=saas dan seed sudah dijalankan ulang."
      );
    }
    cookies[key] = cookie;
  }
}

export function headersFor(key: AccountKey, extra: Record<string, string> = {}) {
  return { Cookie: cookies[key] ?? "", ...extra };
}

export function jsonHeaders(key: AccountKey) {
  return headersFor(key, { "Content-Type": "application/json" });
}

// ── Fixture berkas untuk uji unggah BAP ──────────────────────────────────
const FIXTURE_DIR = path.join(process.cwd(), "test-fixtures");

export const fixtures = {
  image: path.join(FIXTURE_DIR, "test-image.png"),
  smallPdf: path.join(FIXTURE_DIR, "test-small.pdf"),
  largePdf: path.join(FIXTURE_DIR, "test-large.pdf"),
};

export function setupFixtures() {
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  // PNG 1x1 transparan dibuat dinamis agar tidak bergantung pada path lokal
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
  fs.writeFileSync(fixtures.image, Buffer.from(png, "base64"));
  fs.writeFileSync(fixtures.smallPdf, "%PDF-1.4 ... dummy small pdf file content");
  const large = Buffer.alloc(5.2 * 1024 * 1024);
  large.write("%PDF-1.4 ... dummy large pdf file content");
  fs.writeFileSync(fixtures.largePdf, large);
}

export function cleanupFixtures() {
  fs.rmSync(FIXTURE_DIR, { recursive: true, force: true });
}

// ── Helper stok (dipakai suite BAP dan insiden) ──────────────────────────
export interface StockSnapshot {
  status: string;
  quantity: number;
  activeQty: number;
  brokenQty: number;
  repairQty: number;
  retiredQty: number;
  reservedQty: number;
}

/** Ambil detail aset (termasuk bucket stok) dari sudut pandang akun tertentu. */
export async function readAsset(assetId: string, key: AccountKey = "ADMIN_IT") {
  const res = await fetch(`${BASE_URL}/api/assets/${assetId}`, { headers: headersFor(key) });
  return (await safeJson(res))?.data;
}

/** Invariant wajib: total stok = jumlah seluruh bucket (CLAUDE.md §3). */
export function invariantHolds(a: StockSnapshot): boolean {
  return a.quantity === a.activeQty + a.brokenQty + a.repairQty + a.retiredQty + a.reservedQty;
}

// ── Akses database langsung ──────────────────────────────────────────────
// HANYA untuk skenario yang sengaja tidak bisa dibuat lewat API (mis. akun
// yang penugasannya dicabut setelah login) dan untuk membandingkan hitungan.
let pool: Pool | null = null;
let client: PrismaClient | null = null;

export function qaDb(): PrismaClient {
  if (!client) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    client = new PrismaClient({ adapter: new PrismaPg(pool) });
  }
  return client;
}

export async function closeQaDb() {
  await client?.$disconnect();
  await pool?.end();
}
