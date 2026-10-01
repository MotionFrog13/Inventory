import { prisma } from "./prisma";

/**
 * Client database yang terikat ke SATU organisasi (tenant).
 *
 * Sumbu isolasi organisasi ditegakkan di sini — bukan di setiap route — agar
 * route baru tidak mungkin lupa memasangnya. Setiap operasi pada model tenant
 * (semua model kecuali Organization) mendapat `organizationId` di `where` atau
 * `data`; operasi yang tidak dikenali dilempar error (fail closed).
 *
 * Route TIDAK memanggil fungsi ini langsung: `db` diperoleh dari
 * `requireUserScope()` / `getPageContext()` (src/lib/auth.ts) yang lebih dulu
 * memastikan pengguna sah dan sudah ditugaskan. ESLint melarang impor modul ini
 * di luar daftar pengecualian (eslint.config.mjs).
 *
 * Catatan tipe: extension tidak mengubah tipe input Prisma, sehingga `create`
 * tetap mewajibkan `organizationId`. Tulis `organizationId: user.organizationId`
 * secara eksplisit — nilainya tetap ditimpa di sini.
 */

type QueryArgs = {
  where?: Record<string, unknown>;
  data?: unknown;
  create?: Record<string, unknown>;
  update?: unknown;
  [key: string]: unknown;
};

/** Operasi yang cukup dibatasi lewat `where`. */
const WHERE_SCOPED = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "delete",
  "deleteMany",
]);

/** Operasi ubah — dibatasi `where`, dan `data` tidak boleh memindahkan organisasi. */
const UPDATE_SCOPED = new Set(["update", "updateMany", "updateManyAndReturn"]);

const ORGANIZATION_READS = new Set(["findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow"]);

function assertNoOrganizationChange(model: string, data: unknown): void {
  if (data !== null && typeof data === "object" && "organizationId" in data) {
    throw new Error(`tenantDb: ${model}.organizationId tidak boleh diubah`);
  }
}

/** Tambahkan syarat ke `AND` tanpa membuang `AND` milik pemanggil. */
function withAnd(where: Record<string, unknown> | undefined, condition: Record<string, unknown>) {
  const existing = where?.AND;
  const and = Array.isArray(existing) ? existing : existing ? [existing] : [];
  return { ...where, AND: [...and, condition] };
}

export function tenantDb(organizationId: string) {
  if (!organizationId) {
    throw new Error("tenantDb: organizationId wajib diisi");
  }

  return prisma.$extends({
    name: "tenant-isolation",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const a = (args ?? {}) as QueryArgs;
          const run = (next: QueryArgs) => query(next as unknown as typeof args);

          if (model === "Organization") {
            if (!ORGANIZATION_READS.has(operation)) {
              throw new Error(`tenantDb: operasi ${operation} pada Organization tidak diizinkan`);
            }
            // AND — bukan menimpa `id` — agar ID organisasi lain menghasilkan null.
            return run({ ...a, where: withAnd(a.where, { id: organizationId }) });
          }

          if (WHERE_SCOPED.has(operation)) {
            return run({ ...a, where: { ...a.where, organizationId } });
          }
          if (UPDATE_SCOPED.has(operation)) {
            assertNoOrganizationChange(model, a.data);
            return run({ ...a, where: { ...a.where, organizationId } });
          }
          if (operation === "create") {
            return run({ ...a, data: { ...(a.data as object), organizationId } });
          }
          if (operation === "createMany" || operation === "createManyAndReturn") {
            const rows = Array.isArray(a.data) ? a.data : [a.data];
            return run({ ...a, data: rows.map((row) => ({ ...(row as object), organizationId })) });
          }
          if (operation === "upsert") {
            assertNoOrganizationChange(model, a.update);
            return run({
              ...a,
              where: { ...a.where, organizationId },
              create: { ...a.create, organizationId },
            });
          }

          throw new Error(`tenantDb: operasi ${operation} pada ${model} belum ditangani`);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof tenantDb>;
