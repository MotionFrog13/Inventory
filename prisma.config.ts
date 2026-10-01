import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    // Jalankan seed: npx prisma db seed  (atau langsung: npx ts-node prisma/seed.ts)
    // Perintah ini dijalankan Prisma TANPA shell, sehingga operator seperti `&&`
    // tidak bekerja — versi lama (`node -e … && npx ts-node …`) hanya
    // mengeksekusi `node -e` dan seed tidak pernah berjalan. `node` langsung
    // memuat ts-node; modul CommonJS diambil dari bagian "ts-node" di tsconfig.json.
    seed: "node --require ts-node/register prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
