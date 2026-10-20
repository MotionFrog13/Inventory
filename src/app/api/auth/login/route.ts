import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { tenantDb } from "@/lib/tenant-db";
import { comparePassword, signToken } from "@/lib/auth";
import { errorResponse, successResponse } from "@/lib/utils";
import { UNASSIGNED_MESSAGE, resolveScope } from "@/lib/scope";
import { writeActivityLog } from "@/lib/logger";
import { getAppMode } from "@/lib/app-mode";
import { loginAccountKey, loginLimiter } from "@/lib/login-rate-limit";

export const dynamic = "force-dynamic";

// Hash bcrypt (cost 12) atas string acak yang sudah dibuang — tidak ada password
// yang cocok dengannya. Dibandingkan saat akun tidak ditemukan agar waktu respons
// setara dengan "password salah", sehingga penyerang tidak bisa menebak kode
// organisasi atau username yang valid dari lamanya respons.
const TIMING_EQUALIZER_HASH = "$2b$12$V1H6kwWLrOmHqyNjqOhXbe6lojTVqhyKPLgiu4D2vsClP5t4rtaJ.";

// Satu pesan untuk SEMUA kegagalan kredensial (organisasi, pengguna, password).
const INVALID_CREDENTIALS = "Email/username atau password salah";

const LOGIN_USER_SELECT = {
  id: true,
  organizationId: true,
  username: true,
  name: true,
  role: true,
  password: true,
  divisionId: true,
  branches: { select: { branchId: true } },
} as const;

class SelfHostedOrganizationError extends Error {}

async function findLoginUser(identifier: string, orgCode: string) {
  // Username tidak boleh memuat "@", jadi "@" selalu berarti email (unik global).
  if (identifier.includes("@")) {
    return prisma.user.findUnique({ where: { email: identifier }, select: LOGIN_USER_SELECT });
  }

  let organizationId: string | null;
  if (getAppMode() === "saas") {
    if (!orgCode) return null;
    const org = await prisma.organization.findUnique({ where: { slug: orgCode }, select: { id: true } });
    organizationId = org?.id ?? null;
  } else {
    // Self-hosted = tepat satu organisasi. Selain itu konfigurasinya rusak —
    // tolak (fail closed) daripada menebak organisasi.
    const orgs = await prisma.organization.findMany({ select: { id: true }, take: 2 });
    if (orgs.length !== 1) throw new SelfHostedOrganizationError();
    organizationId = orgs[0].id;
  }
  if (!organizationId) return null;

  return prisma.user.findUnique({
    where: { organizationId_username: { organizationId, username: identifier } },
    select: LOGIN_USER_SELECT,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return errorResponse("Format permintaan login tidak valid", "Validasi gagal", 400);
    }
    // `username` diterima sebagai alias `identifier` untuk klien lama.
    const identifier = String(body.identifier ?? body.username ?? "").trim().toLowerCase();
    const password = typeof body.password === "string" ? body.password : "";
    const orgCode = String(body.orgCode ?? "").trim().toLowerCase();

    if (!identifier || !password) {
      return errorResponse("Email/username dan password wajib diisi", "Validasi gagal", 400);
    }

    if (identifier.length > 254 || orgCode.length > 32 || password.length > 1024) {
      return errorResponse("Input login terlalu panjang", "Validasi gagal", 400);
    }
    // Email unik global; kode organisasi tidak boleh menjadi jalan melewati
    // batas percobaan pada akun email yang sama. Tidak mempercayai IP dari klien.
    const key = loginAccountKey(identifier, orgCode, getAppMode());
    const retryAfter = loginLimiter.consume(key);
    if (retryAfter > 0) {
      const response = errorResponse("Terlalu banyak percobaan login. Silakan coba lagi nanti.", "Login dibatasi", 429);
      response.headers.set("Retry-After", String(retryAfter));
      return response;
    }

    let user;
    try {
      user = await findLoginUser(identifier, orgCode);
    } catch (error) {
      if (error instanceof SelfHostedOrganizationError) {
        console.error("APP_MODE=self-hosted namun jumlah organisasi di database bukan satu.");
        return errorResponse(
          "Instalasi self-hosted harus memiliki tepat satu organisasi",
          "Konfigurasi tidak valid",
          503
        );
      }
      throw error;
    }

    const passwordValid = await comparePassword(password, user?.password ?? TIMING_EQUALIZER_HASH);
    if (!user || !passwordValid) {
      return errorResponse(INVALID_CREDENTIALS, "Login gagal", 401);
    }

    const scope = resolveScope({ ...user, branches: user.branches.map((b) => ({ id: b.branchId })) });
    if (!scope) {
      return errorResponse(UNASSIGNED_MESSAGE, "Login gagal", 403);
    }

    const token = signToken({
      userId: user.id,
      organizationId: user.organizationId,
      username: user.username,
      role: user.role,
      name: user.name,
    });

    const response = successResponse(
      { id: user.id, username: user.username, name: user.name, role: user.role },
      "Login berhasil"
    );

    const cookieOptions = [`token=${token}`, "HttpOnly", "Path=/", `Max-Age=${60 * 60 * 8}`, "SameSite=Lax"];
    if (process.env.NODE_ENV === "production") {
      cookieOptions.push("Secure");
    }
    response.headers.set("Set-Cookie", cookieOptions.join("; "));

    await writeActivityLog(
      {
        db: tenantDb(user.organizationId),
        user: { id: user.id, username: user.username, organizationId: user.organizationId },
      },
      "LOGIN",
      `Pengguna ${user.username} (${user.role}) berhasil masuk`,
      request
    );

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return errorResponse("Terjadi kesalahan server", "Login gagal", 500);
  }
}
