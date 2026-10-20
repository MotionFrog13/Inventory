import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { prisma } from "../../src/lib/prisma";
import { tenantDb } from "../../src/lib/tenant-db";
import { isForeignKeyViolation, isRecordNotFound, isUniqueViolation } from "../../src/lib/db-errors";
import { initialStock, moveStock, stockMutationWhere, stockUpdateData, stockSum } from "../../src/lib/stock";

// Dua organisasi sementara dengan ID unik per run — tidak menyentuh data seed.
const RUN = Date.now().toString(36);

interface Fixture {
  org: string;
  division: string;
  category: string;
  branch1: string;
  branch2: string;
  user: string;
  asset: string;
}

function fixtureIds(tag: string): Fixture {
  const p = `it-${RUN}-${tag}`;
  return {
    org: `${p}-org`,
    division: `${p}-div`,
    category: `${p}-cat`,
    branch1: `${p}-br1`,
    branch2: `${p}-br2`,
    user: `${p}-user`,
    asset: `${p}-asset`,
  };
}

const A = fixtureIds("a");
const B = fixtureIds("b");

async function createFixture(f: Fixture) {
  await prisma.organization.create({ data: { id: f.org, name: `Org ${f.org}`, slug: f.org } });
  await prisma.division.create({ data: { id: f.division, organizationId: f.org, name: "IT" } });
  await prisma.category.create({
    data: { id: f.category, organizationId: f.org, divisionId: f.division, name: "Laptop" },
  });
  await prisma.branch.createMany({
    data: [
      { id: f.branch1, organizationId: f.org, name: "Outlet 1", location: "-" },
      { id: f.branch2, organizationId: f.org, name: "Outlet 2", location: "-" },
    ],
  });
  // Nested create: UserBranch harus mewarisi organizationId dari User.
  await prisma.user.create({
    data: {
      id: f.user,
      organizationId: f.org,
      username: "admin",
      password: "x",
      name: "Admin",
      role: "DIVISION_ADMIN",
      divisionId: f.division,
      branches: { create: [{ branchId: f.branch1 }] },
    },
  });
  await prisma.asset.create({
    data: {
      id: f.asset,
      organizationId: f.org,
      divisionId: f.division,
      categoryId: f.category,
      branchId: f.branch1,
      name: "Laptop Uji",
      status: "ACTIVE",
      quantity: 1,
      activeQty: 1,
    },
  });
}

async function removeFixture(f: Fixture) {
  const where = { organizationId: f.org };
  await prisma.transfer.deleteMany({ where });
  await prisma.asset.deleteMany({ where });
  await prisma.userBranch.deleteMany({ where });
  await prisma.user.deleteMany({ where });
  await prisma.category.deleteMany({ where });
  await prisma.division.deleteMany({ where });
  await prisma.branch.deleteMany({ where });
  await prisma.organization.deleteMany({ where: { id: f.org } });
}

describe("tenantDb — isolasi antar-organisasi", () => {
  const dbA = tenantDb(A.org);

  before(async () => {
    await createFixture(A);
    await createFixture(B);
  });

  test("simultaneous stock writes accept one snapshot and roll back stale workflows", async () => {
    const id = `${A.asset}-concurrency`;
    await dbA.asset.create({ data: {
      id, organizationId: A.org, divisionId: A.division, categoryId: A.category,
      branchId: A.branch1, name: "Concurrent stock", ...stockUpdateData(initialStock(100, "ACTIVE")),
    } });
    try {
      const snapshot = await dbA.asset.findUniqueOrThrow({ where: { id } });
      const writes = await Promise.allSettled([
        dbA.asset.update({ where: stockMutationWhere(snapshot), data: stockUpdateData(moveStock(snapshot, "activeQty", "brokenQty", 3)) }),
        dbA.asset.update({ where: stockMutationWhere(snapshot), data: stockUpdateData(moveStock(snapshot, "activeQty", "reservedQty", 5)) }),
      ]);
      assert.equal(writes.filter((r) => r.status === "fulfilled").length, 1);
      const failed = writes.find((r) => r.status === "rejected");
      assert.ok(failed?.status === "rejected" && isRecordNotFound(failed.reason));
      const current = await dbA.asset.findUniqueOrThrow({ where: { id } });
      assert.equal(stockSum(current), 100);
      await assert.rejects(dbA.$transaction([
        dbA.incident.create({ data: { organizationId: A.org, assetId: id, description: "Must roll back" } }),
        dbA.asset.update({ where: stockMutationWhere(snapshot), data: stockUpdateData(initialStock(1, "ACTIVE")) }),
      ]), isRecordNotFound);
      assert.equal(await dbA.incident.count({ where: { assetId: id } }), 0);
      assert.equal((await dbA.asset.findUniqueOrThrow({ where: { id } })).quantity, 100);
      await dbA.asset.update({ where: { id }, data: { branchId: A.branch2 } });
      await assert.rejects(dbA.asset.update({ where: stockMutationWhere(current), data: stockUpdateData(initialStock(1, "ACTIVE")) }), isRecordNotFound);
    } finally {
      await dbA.asset.delete({ where: { id } });
    }
  });

  after(async () => {
    await removeFixture(A);
    await removeFixture(B);
    await prisma.$disconnect();
  });

  test("setiap model selain Organization punya kolom organizationId", () => {
    const enums = Prisma as unknown as Record<string, Record<string, string> | undefined>;
    for (const model of Object.values(Prisma.ModelName)) {
      if (model === "Organization") continue;
      assert.ok(enums[`${model}ScalarFieldEnum`]?.organizationId, `${model} tidak punya organizationId`);
    }
  });

  test("baca hanya melihat organisasi sendiri", async () => {
    const assets = await dbA.asset.findMany();
    assert.deepEqual(assets.map((a) => a.id), [A.asset]);
    assert.equal(await dbA.asset.count(), 1);
    assert.equal(await dbA.asset.findUnique({ where: { id: B.asset } }), null);
    assert.equal(await dbA.asset.findFirst({ where: { id: B.asset } }), null);
    // organizationId dari pemanggil ditimpa — tetap menghitung milik A.
    assert.equal(await dbA.branch.count({ where: { organizationId: B.org } }), 2);
  });

  test("agregasi dan groupBy terbatas pada organisasi sendiri", async () => {
    const sum = await dbA.asset.aggregate({ _sum: { quantity: true } });
    assert.equal(sum._sum.quantity, 1);
    const groups = await dbA.asset.groupBy({ by: ["branchId"], _count: { id: true } });
    assert.deepEqual(groups.map((g) => g.branchId), [A.branch1]);
  });

  test("ubah/hapus baris organisasi lain tidak berpengaruh", async () => {
    await assert.rejects(dbA.asset.update({ where: { id: B.asset }, data: { name: "Dibajak" } }), isRecordNotFound);
    await assert.rejects(dbA.asset.delete({ where: { id: B.asset } }), isRecordNotFound);
    assert.equal((await dbA.asset.updateMany({ where: { id: B.asset }, data: { name: "Dibajak" } })).count, 0);
    assert.equal((await dbA.asset.deleteMany({ where: { id: B.asset } })).count, 0);
    const assetB = await prisma.asset.findUniqueOrThrow({ where: { id: B.asset } });
    assert.equal(assetB.name, "Laptop Uji");
  });

  test("create memakai organisasi sendiri walau pemanggil mengirim organisasi lain", async () => {
    const created = await dbA.division.create({ data: { organizationId: B.org, name: `Divisi ${RUN}` } });
    assert.equal(created.organizationId, A.org);
    await prisma.division.delete({ where: { id: created.id } });
  });

  test("update tidak boleh memindahkan baris ke organisasi lain", async () => {
    await assert.rejects(
      dbA.division.update({ where: { id: A.division }, data: { organizationId: B.org } }),
      /tidak boleh diubah/
    );
  });

  test("berlaku di dalam transaksi interaktif", async () => {
    await dbA.$transaction(async (tx) => {
      assert.equal(await tx.asset.findUnique({ where: { id: B.asset } }), null);
      assert.equal((await tx.asset.updateMany({ where: { id: B.asset }, data: { name: "Dibajak" } })).count, 0);
      assert.equal(await tx.asset.count(), 1);
    });
  });

  test("berlaku di dalam transaksi array", async () => {
    const [count, found] = await dbA.$transaction([
      dbA.asset.count(),
      dbA.asset.findUnique({ where: { id: B.asset } }),
    ]);
    assert.equal(count, 1);
    assert.equal(found, null);
  });

  test("nested create mewarisi organizationId dari induk", async () => {
    const link = await prisma.userBranch.findFirstOrThrow({ where: { userId: A.user } });
    assert.equal(link.organizationId, A.org);
  });

  test("FK komposit menolak referensi lintas organisasi", async () => {
    await assert.rejects(
      prisma.transfer.create({
        data: {
          organizationId: A.org,
          assetId: A.asset,
          fromBranchId: A.branch1,
          toBranchId: B.branch1,
          reason: "uji",
          requestedById: A.user,
        },
      }),
      isForeignKeyViolation
    );
    await assert.rejects(
      prisma.asset.create({
        data: {
          organizationId: A.org,
          divisionId: A.division,
          categoryId: B.category,
          branchId: A.branch1,
          name: "Kategori salah",
          status: "ACTIVE",
        },
      }),
      isForeignKeyViolation
    );
  });

  test("pelanggaran unique memakai kode P2002", async () => {
    await assert.rejects(dbA.division.create({ data: { organizationId: A.org, name: "IT" } }), isUniqueViolation);
  });

  test("Organization: hanya organisasi sendiri yang terbaca, tulis ditolak", async () => {
    assert.equal(await dbA.organization.findUnique({ where: { id: B.org } }), null);
    assert.equal((await dbA.organization.findUnique({ where: { id: A.org } }))?.id, A.org);
    await assert.rejects(dbA.organization.update({ where: { id: A.org }, data: { name: "x" } }), /tidak diizinkan/);
  });
});
