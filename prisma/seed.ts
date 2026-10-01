import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import "dotenv/config";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

type Condition = "ACTIVE" | "BROKEN" | "REPAIR" | "RETIRED";

// Stok awal: seluruh kuantitas masuk ke satu bucket sesuai kondisi, menjaga
// invariant quantity = active + broken + repair + retired + reserved. Logika
// yang sama dipakai runtime di `initialStock()` (src/lib/stock.ts) — disalin
// agar seed tidak bergantung pada alias path "@/" saat dijalankan ts-node.
function stockFor(status: Condition, quantity = 1) {
  return {
    status,
    quantity,
    activeQty: status === "ACTIVE" ? quantity : 0,
    brokenQty: status === "BROKEN" ? quantity : 0,
    repairQty: status === "REPAIR" ? quantity : 0,
    retiredQty: status === "RETIRED" ? quantity : 0,
    reservedQty: 0,
  };
}

const DAY = 24 * 60 * 60 * 1000;
const fromNow = (days: number) => new Date(Date.now() + days * DAY);

// Urutan hapus mengikuti ketergantungan FK (anak lebih dulu).
async function wipe() {
  await prisma.activityLog.deleteMany();
  await prisma.bap.deleteMany();
  await prisma.mdmCommand.deleteMany();
  await prisma.mdmDevice.deleteMany();
  await prisma.transfer.deleteMany();
  await prisma.incident.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.userBranch.deleteMany();
  await prisma.user.deleteMany();
  await prisma.category.deleteMany();
  await prisma.division.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.organization.deleteMany();
}

interface SeedUser {
  id: string;
  username: string;
  name: string;
  role: Role;
  divisionId: string | null;
  branchIds: string[];
  email?: string;
  staff?: boolean; // password staff123, selain itu admin123
}

interface SeedAsset {
  id: string;
  divisionId: string;
  categoryId: string;
  branchId: string;
  name: string;
  serialNumber: string | null;
  brand: string;
  model: string;
  specs: string;
  purchaseDate: Date;
  warrantyDate: Date | null;
  stock: ReturnType<typeof stockFor>;
}

// ── Organisasi demo ────────────────────────────────────────────────────────
const DEMO = "org-demo";

const DEMO_DIVISIONS = [
  { id: "div-it", name: "IT", description: "Perangkat IT, jaringan, dan POS" },
  { id: "div-kitchen", name: "Kitchen", description: "Peralatan dapur" },
  { id: "div-engineering", name: "Engineering", description: "Fasilitas gedung, listrik, dan mesin" },
];

// [id, divisionId, name]
const DEMO_CATEGORIES: [string, string, string][] = [
  ["cat-it-laptop", "div-it", "Laptop"],
  ["cat-it-pc", "div-it", "PC"],
  ["cat-it-printer", "div-it", "Printer"],
  ["cat-it-cctv", "div-it", "CCTV"],
  ["cat-it-router", "div-it", "Router"],
  ["cat-it-switch", "div-it", "Switch"],
  ["cat-it-ups", "div-it", "UPS"],
  ["cat-it-tablet-pos", "div-it", "Tablet POS"],
  ["cat-it-lainnya", "div-it", "Lain-lain"],
  ["cat-kitchen-chiller", "div-kitchen", "Chiller"],
  ["cat-kitchen-freezer", "div-kitchen", "Freezer"],
  ["cat-kitchen-kompor", "div-kitchen", "Kompor"],
  ["cat-kitchen-oven", "div-kitchen", "Oven"],
  ["cat-kitchen-deep-fryer", "div-kitchen", "Deep Fryer"],
  ["cat-kitchen-blender", "div-kitchen", "Blender"],
  ["cat-kitchen-rice-cooker", "div-kitchen", "Rice Cooker"],
  ["cat-kitchen-lainnya", "div-kitchen", "Lain-lain"],
  ["cat-eng-genset", "div-engineering", "Genset"],
  ["cat-eng-ac", "div-engineering", "AC"],
  ["cat-eng-pompa-air", "div-engineering", "Pompa Air"],
  ["cat-eng-panel-listrik", "div-engineering", "Panel Listrik"],
  ["cat-eng-lainnya", "div-engineering", "Lain-lain"],
];

const DEMO_USERS: SeedUser[] = [
  { id: "user-superadmin", username: "superadmin", name: "Super Administrator", role: "SUPER_ADMIN", divisionId: null, branchIds: [], email: "superadmin@demo.local" },
  { id: "user-admin-it", username: "admin_it", name: "Admin IT Bogor", role: "DIVISION_ADMIN", divisionId: "div-it", branchIds: ["branch-bogor"] },
  { id: "user-staff-it", username: "staff_it", name: "Staf IT Bogor", role: "DIVISION_STAFF", divisionId: "div-it", branchIds: ["branch-bogor"], staff: true },
  { id: "user-admin-it-jakarta", username: "admin_it_jakarta", name: "Admin IT Jakarta Selatan", role: "DIVISION_ADMIN", divisionId: "div-it", branchIds: ["branch-jakarta"] },
  { id: "user-admin-kitchen", username: "admin_kitchen", name: "Admin Kitchen Bogor", role: "DIVISION_ADMIN", divisionId: "div-kitchen", branchIds: ["branch-bogor"] },
  { id: "user-staff-kitchen", username: "staff_kitchen", name: "Staf Kitchen Bogor", role: "DIVISION_STAFF", divisionId: "div-kitchen", branchIds: ["branch-bogor"], staff: true },
  { id: "user-admin-engineering", username: "admin_engineering", name: "Admin Engineering", role: "DIVISION_ADMIN", divisionId: "div-engineering", branchIds: ["branch-bogor", "branch-jakarta"] },
  { id: "user-teknisi-engineering", username: "teknisi_engineering", name: "Teknisi Engineering", role: "DIVISION_STAFF", divisionId: "div-engineering", branchIds: ["branch-bogor", "branch-jakarta"], staff: true },
];

const DEMO_ASSETS: SeedAsset[] = [
  // IT
  { id: "asset-laptop-dell-bogor", divisionId: "div-it", categoryId: "cat-it-laptop", branchId: "branch-bogor", name: "Laptop Dell Latitude 3420", serialNumber: "DL-LAT-3420-001", brand: "Dell", model: "Latitude 3420", specs: "Intel Core i5-1135G7, 8GB RAM, 256GB SSD", purchaseDate: new Date("2024-01-15"), warrantyDate: fromNow(365), stock: stockFor("ACTIVE") },
  { id: "asset-printer-hp-bogor", divisionId: "div-it", categoryId: "cat-it-printer", branchId: "branch-bogor", name: "Printer HP LaserJet Pro M404dn", serialNumber: "HP-LJP-M404-001", brand: "HP", model: "LaserJet Pro M404dn", specs: "Monochrome, Duplex, Network", purchaseDate: new Date("2023-06-20"), warrantyDate: fromNow(30), stock: stockFor("ACTIVE") },
  { id: "asset-cctv-bogor", divisionId: "div-it", categoryId: "cat-it-cctv", branchId: "branch-bogor", name: "CCTV Hikvision DS-2CD2143G2-I", serialNumber: "HK-CCTV-2143-001", brand: "Hikvision", model: "DS-2CD2143G2-I", specs: "4MP, WDR, IR 30m, PoE", purchaseDate: new Date("2023-03-10"), warrantyDate: fromNow(-30), stock: stockFor("ACTIVE") },
  { id: "asset-pc-lenovo-bogor", divisionId: "div-it", categoryId: "cat-it-pc", branchId: "branch-bogor", name: "PC Lenovo ThinkCentre M70s", serialNumber: "LN-TC-M70S-001", brand: "Lenovo", model: "ThinkCentre M70s", specs: "Intel Core i3-10100, 4GB RAM, 1TB HDD", purchaseDate: new Date("2022-11-01"), warrantyDate: fromNow(-30), stock: stockFor("BROKEN") },
  { id: "asset-router-mikrotik-jkt", divisionId: "div-it", categoryId: "cat-it-router", branchId: "branch-jakarta", name: "Router MikroTik RB750Gr3", serialNumber: "MK-RB750-001", brand: "MikroTik", model: "RB750Gr3", specs: "5x Gigabit Ethernet, RouterOS L4", purchaseDate: new Date("2024-02-01"), warrantyDate: fromNow(365), stock: stockFor("ACTIVE") },
  { id: "asset-laptop-asus-jkt", divisionId: "div-it", categoryId: "cat-it-laptop", branchId: "branch-jakarta", name: "Laptop ASUS VivoBook 14", serialNumber: "AS-VB14-001", brand: "ASUS", model: "VivoBook 14 X1404VA", specs: "Intel Core i5-1335U, 16GB RAM, 512GB SSD", purchaseDate: new Date("2024-03-20"), warrantyDate: fromNow(365), stock: stockFor("REPAIR") },
  { id: "asset-ups-bandung", divisionId: "div-it", categoryId: "cat-it-ups", branchId: "branch-bandung", name: "UPS APC Back-UPS 1100VA", serialNumber: "APC-BUP-1100-001", brand: "APC", model: "Back-UPS BX1100LI-MS", specs: "1100VA/550W, 4 outlet", purchaseDate: new Date("2024-01-10"), warrantyDate: fromNow(365), stock: stockFor("ACTIVE") },
  { id: "asset-kabel-lan-bogor", divisionId: "div-it", categoryId: "cat-it-lainnya", branchId: "branch-bogor", name: "Kabel LAN Cat6 3m", serialNumber: null, brand: "Belden", model: "Cat6 UTP 3m", specs: "UTP Cat6, panjang 3 meter, konektor RJ45", purchaseDate: new Date("2026-01-05"), warrantyDate: null, stock: stockFor("ACTIVE", 50) },
  { id: "asset-tablet-pos-bogor", divisionId: "div-it", categoryId: "cat-it-tablet-pos", branchId: "branch-bogor", name: "Tablet POS Samsung Galaxy Tab A9", serialNumber: "SM-TAB-A9-001", brand: "Samsung", model: "Galaxy Tab A9+", specs: "11 inci, 4GB RAM, dipakai kasir & dapur", purchaseDate: new Date("2025-09-01"), warrantyDate: fromNow(200), stock: stockFor("ACTIVE", 2) },
  // Kitchen
  { id: "asset-chiller-bogor", divisionId: "div-kitchen", categoryId: "cat-kitchen-chiller", branchId: "branch-bogor", name: "Chiller GEA 1200L", serialNumber: "GEA-CH-1200-001", brand: "GEA", model: "Chiller 1200L", specs: "Kapasitas 1200 liter, suhu -2°C s/d 8°C", purchaseDate: new Date("2023-05-10"), warrantyDate: fromNow(365), stock: stockFor("ACTIVE", 2) },
  { id: "asset-freezer-jkt", divisionId: "div-kitchen", categoryId: "cat-kitchen-freezer", branchId: "branch-jakarta", name: "Freezer Panasonic SCR-T49", serialNumber: "PAN-FRZ-T49-001", brand: "Panasonic", model: "SCR-T49", specs: "Kapasitas 490 liter, Deep Freezer", purchaseDate: new Date("2024-01-01"), warrantyDate: fromNow(60), stock: stockFor("ACTIVE") },
  { id: "asset-ricecooker-bandung", divisionId: "div-kitchen", categoryId: "cat-kitchen-rice-cooker", branchId: "branch-bandung", name: "Rice Cooker Miyako 10L", serialNumber: null, brand: "Miyako", model: "MRC-10L", specs: "Kapasitas 10 liter, stainless steel", purchaseDate: new Date("2023-08-01"), warrantyDate: fromNow(-30), stock: stockFor("ACTIVE", 5) },
  // Barang habis pakai ber-stok besar: 100 pcs sumpit, 8 di antaranya patah.
  { id: "asset-sumpit-jkt", divisionId: "div-kitchen", categoryId: "cat-kitchen-lainnya", branchId: "branch-jakarta", name: "Sumpit Kayu Reusable", serialNumber: null, brand: "Generic", model: "Sumpit Kayu 23cm", specs: "Kayu birch, panjang 23cm, reusable", purchaseDate: new Date("2026-02-01"), warrantyDate: null, stock: { ...stockFor("ACTIVE", 100), activeQty: 92, brokenQty: 8 } },
  // Engineering — tersebar di ketiga outlet (TC-USR-03, TC-TRF-05)
  { id: "asset-genset-bogor", divisionId: "div-engineering", categoryId: "cat-eng-genset", branchId: "branch-bogor", name: "Genset Perkins 20 kVA", serialNumber: "PK-GEN-20-001", brand: "Perkins", model: "404D-22G", specs: "20 kVA, silent type", purchaseDate: new Date("2022-07-01"), warrantyDate: fromNow(-120), stock: stockFor("ACTIVE") },
  { id: "asset-ac-bogor", divisionId: "div-engineering", categoryId: "cat-eng-ac", branchId: "branch-bogor", name: "AC Daikin 2 PK", serialNumber: "DK-AC-2PK-BGR", brand: "Daikin", model: "FTKC50", specs: "2 PK, inverter", purchaseDate: new Date("2024-05-01"), warrantyDate: fromNow(300), stock: stockFor("ACTIVE", 2) },
  { id: "asset-ac-jkt", divisionId: "div-engineering", categoryId: "cat-eng-ac", branchId: "branch-jakarta", name: "AC Daikin 2 PK", serialNumber: "DK-AC-2PK-JKT", brand: "Daikin", model: "FTKC50", specs: "2 PK, inverter", purchaseDate: new Date("2024-05-01"), warrantyDate: fromNow(300), stock: stockFor("ACTIVE", 3) },
  { id: "asset-pompa-bandung", divisionId: "div-engineering", categoryId: "cat-eng-pompa-air", branchId: "branch-bandung", name: "Pompa Air Grundfos", serialNumber: "GF-PMP-001", brand: "Grundfos", model: "CM5-4", specs: "Pompa booster 0,75 kW", purchaseDate: new Date("2023-02-01"), warrantyDate: fromNow(-60), stock: stockFor("ACTIVE") },
];

async function createUsers(organizationId: string, users: SeedUser[], adminHash: string, staffHash: string) {
  for (const u of users) {
    await prisma.user.create({
      data: {
        id: u.id,
        organizationId,
        username: u.username,
        name: u.name,
        role: u.role,
        email: u.email ?? null,
        password: u.staff ? staffHash : adminHash,
        divisionId: u.divisionId,
        // Nested create: organizationId UserBranch diwarisi dari User.
        branches: { create: u.branchIds.map((branchId) => ({ branchId })) },
      },
    });
  }
}

async function seedDemo(adminHash: string, staffHash: string) {
  await prisma.organization.create({ data: { id: DEMO, name: "Demo Resto", slug: "demo" } });

  await prisma.branch.createMany({
    data: [
      { id: "branch-bogor", organizationId: DEMO, name: "Bogor (Pusat)", location: "Jl. Pajajaran No. 123, Bogor, Jawa Barat 16143" },
      { id: "branch-jakarta", organizationId: DEMO, name: "Jakarta Selatan", location: "Jl. Sudirman Kav. 52-53, Jakarta Selatan, DKI Jakarta 12190" },
      { id: "branch-bandung", organizationId: DEMO, name: "Bandung", location: "Jl. Braga No. 45, Bandung, Jawa Barat 40111" },
    ],
  });

  await prisma.division.createMany({ data: DEMO_DIVISIONS.map((d) => ({ ...d, organizationId: DEMO })) });
  await prisma.category.createMany({
    data: DEMO_CATEGORIES.map(([id, divisionId, name]) => ({ id, divisionId, name, organizationId: DEMO })),
  });

  await createUsers(DEMO, DEMO_USERS, adminHash, staffHash);

  for (const { stock, ...asset } of DEMO_ASSETS) {
    await prisma.asset.create({ data: { ...asset, ...stock, organizationId: DEMO } });
  }

  await prisma.incident.createMany({
    data: [
      { id: "incident-pc-bogor", organizationId: DEMO, assetId: "asset-pc-lenovo-bogor", quantity: 1, description: "PC tidak bisa menyala. Indikator power mati total, sudah dicoba ganti kabel power.", reportedAt: new Date("2025-06-10"), handledBy: "Teknisi IT" },
      { id: "incident-laptop-jkt", organizationId: DEMO, assetId: "asset-laptop-asus-jkt", quantity: 1, description: "Layar laptop berkedip-kedip dan kadang mati. Kemungkinan masalah pada kabel flex display.", reportedAt: new Date("2025-06-15"), handledBy: "Teknisi IT" },
      { id: "incident-sumpit-jkt", organizationId: DEMO, assetId: "asset-sumpit-jkt", quantity: 8, description: "8 pcs sumpit patah setelah dipakai pada jam sibuk akhir pekan.", reportedAt: new Date("2026-08-01"), handledBy: "Staf Kitchen" },
    ],
  });

  await prisma.transfer.create({
    data: {
      id: "transfer-sample-001",
      organizationId: DEMO,
      assetId: "asset-router-mikrotik-jkt",
      fromBranchId: "branch-jakarta",
      toBranchId: "branch-bandung",
      reason: "Permintaan mutasi operasional — jaringan Bandung perlu upgrade",
      status: "PENDING",
      requestedById: "user-admin-it-jakarta",
      transferredAt: new Date("2026-06-20"),
    },
  });
}

// ── Organisasi uji kedua (hanya mode saas) — membuktikan isolasi tenant ────
const UJI_B = "org-uji-b";

async function seedOrgB(adminHash: string) {
  await prisma.organization.create({ data: { id: UJI_B, name: "Org Uji B", slug: "uji-b" } });
  await prisma.branch.createMany({
    data: [
      { id: "branch-b1", organizationId: UJI_B, name: "Outlet B1", location: "Alamat uji B1" },
      { id: "branch-b2", organizationId: UJI_B, name: "Outlet B2", location: "Alamat uji B2" },
    ],
  });
  await prisma.division.create({ data: { id: "div-b-it", organizationId: UJI_B, name: "IT" } });
  await prisma.category.create({ data: { id: "cat-b-laptop", organizationId: UJI_B, divisionId: "div-b-it", name: "Laptop" } });

  // Username SAMA dengan organisasi demo — login wajib memilih akun lewat kode organisasi.
  await createUsers(
    UJI_B,
    [
      { id: "user-b-superadmin", username: "superadmin", name: "Super Admin Org B", role: "SUPER_ADMIN", divisionId: null, branchIds: [], email: "superadmin@uji-b.local" },
      { id: "user-b-admin-it", username: "admin_it", name: "Admin IT Org B", role: "DIVISION_ADMIN", divisionId: "div-b-it", branchIds: ["branch-b1"] },
    ],
    adminHash,
    adminHash
  );

  // 5 pcs: 4 aktif + 1 dipesan BAP PENDING (invariant tetap terjaga).
  await prisma.asset.create({
    data: {
      id: "asset-b-laptop",
      organizationId: UJI_B,
      divisionId: "div-b-it",
      categoryId: "cat-b-laptop",
      branchId: "branch-b1",
      name: "Laptop Org B",
      serialNumber: "B-LAPTOP-001",
      ...stockFor("ACTIVE", 5),
      activeQty: 4,
      reservedQty: 1,
    },
  });
  await prisma.transfer.create({
    data: {
      id: "transfer-b-001",
      organizationId: UJI_B,
      assetId: "asset-b-laptop",
      fromBranchId: "branch-b1",
      toBranchId: "branch-b2",
      reason: "Uji isolasi organisasi",
      status: "PENDING",
      requestedById: "user-b-admin-it",
    },
  });
  await prisma.bap.create({
    data: {
      id: "bap-b-001",
      organizationId: UJI_B,
      assetId: "asset-b-laptop",
      quantity: 1,
      sourceCondition: "ACTIVE",
      fileUrl: "/uploads/bap/seed/uji-b.pdf",
      status: "PENDING",
      previousStatus: "ACTIVE",
      requestedById: "user-b-admin-it",
    },
  });
}

async function main() {
  // PENGAMAN: seed ini menghapus SELURUH data termasuk organisasi, pengguna,
  // dan audit log. Jalankan hanya di development/QA. Untuk menimpa pengaman
  // ini secara sadar, set ALLOW_DESTRUCTIVE_SEED=true.
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DESTRUCTIVE_SEED !== "true") {
    throw new Error(
      "Seed dibatalkan: NODE_ENV=production. Seed ini menghapus seluruh data. " +
        "Set ALLOW_DESTRUCTIVE_SEED=true hanya jika Anda benar-benar bermaksud mengosongkan database ini."
    );
  }

  const saas = process.env.APP_MODE === "saas";
  console.log(`🌱 Seeding database (APP_MODE=${saas ? "saas" : "self-hosted"})...`);
  await wipe();

  const adminHash = await bcrypt.hash("admin123", 12);
  const staffHash = await bcrypt.hash("staff123", 12);

  await seedDemo(adminHash, staffHash);
  console.log(`✅ Organisasi "Demo Resto" (kode: demo): 3 outlet, 3 divisi, ${DEMO_CATEGORIES.length} kategori, ${DEMO_USERS.length} pengguna, ${DEMO_ASSETS.length} aset`);

  if (saas) {
    await seedOrgB(adminHash);
    console.log('✅ Organisasi "Org Uji B" (kode: uji-b) untuk uji isolasi');
  }

  console.log("\nAkun (kode organisasi: demo) — password admin123 / staff123:");
  for (const u of DEMO_USERS) {
    console.log(`  ${u.username.padEnd(20)} ${u.staff ? "staff123" : "admin123"}  ${u.role}`);
  }
  if (saas) console.log("\nAkun (kode organisasi: uji-b): superadmin / admin123, admin_it / admin123");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
