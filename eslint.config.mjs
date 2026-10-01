import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Berkas yang BOLEH memakai client Prisma mentah / tenantDb(). Di luar daftar
// ini, akses database wajib lewat `db` dari requireUserScope()/getPageContext()
// agar isolasi organisasi dan pengecekan fail-closed tidak bisa dilewati.
const RAW_DB_ALLOWLIST = [
  "src/lib/prisma.ts",
  "src/lib/tenant-db.ts",
  "src/lib/auth.ts",
  "src/app/api/auth/**",
  "prisma/seed.ts",
  "qa-test-runner.ts",
  "qa/**",
  "tests/**",
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
      "@typescript-eslint/no-unused-vars": "warn",
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    ignores: RAW_DB_ALLOWLIST,
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@prisma/client",
              importNames: ["PrismaClient"],
              message: "Jangan membuat PrismaClient sendiri — gunakan `db` dari requireUserScope()/getPageContext().",
            },
          ],
          patterns: [
            {
              // `./prisma` ikut dilarang: berkas baru di src/lib tidak boleh
              // melewati aturan ini lewat impor relatif.
              group: ["@/lib/prisma", "**/lib/prisma", "./prisma"],
              message: "Client Prisma mentah melewati isolasi organisasi. Gunakan `db` dari requireUserScope()/getPageContext().",
            },
            {
              group: ["@/lib/tenant-db", "**/lib/tenant-db", "./tenant-db"],
              allowTypeImports: true,
              message: "tenantDb() hanya dipanggil src/lib/auth.ts setelah pengecekan akses. Gunakan `db` dari konteks request.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[property.name=/^\\$(queryRaw|executeRaw|queryRawUnsafe|executeRawUnsafe)$/]",
          message: "SQL mentah melewati client tenant dan dilarang.",
        },
      ],
    },
  },
]);

export default eslintConfig;
