import { BASE_URL, cleanupFixtures, closeQaDb, loginAll, setupFixtures, testResults } from "./qa/context";
import * as activity from "./qa/suites/activity";
import * as assets from "./qa/suites/assets";
import * as auth from "./qa/suites/auth";
import * as bap from "./qa/suites/bap";
import * as branches from "./qa/suites/branches";
import * as divisions from "./qa/suites/divisions";
import * as incidents from "./qa/suites/incidents";
import * as mdm from "./qa/suites/mdm";
import * as transfers from "./qa/suites/transfers";
import * as users from "./qa/suites/users";
import * as security from "./qa/suites/security";

// Urutan penting: suite belakangan mengandalkan route yang diuji lebih dulu.
const SUITES: Record<string, () => Promise<void>> = {
  auth: auth.run,
  divisions: divisions.run,
  assets: assets.run,
  branches: branches.run,
  users: users.run,
  transfers: transfers.run,
  bap: bap.run,
  incidents: incidents.run,
  activity: activity.run,
  mdm: mdm.run,
  security: security.run,
};

async function main() {
  console.log("\x1b[36m==================================================\x1b[0m");
  console.log("\x1b[36m🚀 RUNNING ASSET & INVENTORY INTEGRATION QA\x1b[0m");
  console.log("\x1b[36m==================================================\x1b[0m");

  try {
    await fetch(`${BASE_URL}/api/auth/me`);
  } catch {
    console.error(`\n❌ Tidak dapat terhubung ke server di ${BASE_URL}. Jalankan \`npm run dev\` lebih dulu.\n`);
    process.exit(1);
  }

  // `QA_ONLY=auth,assets` menjalankan sebagian suite.
  const only = (process.env.QA_ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const unknown = only.filter((name) => !(name in SUITES));
  if (unknown.length > 0) {
    console.error(`❌ Suite tidak dikenal: ${unknown.join(", ")}. Pilihan: ${Object.keys(SUITES).join(", ")}`);
    process.exit(1);
  }

  setupFixtures();
  try {
    await loginAll();
    for (const [name, run] of Object.entries(SUITES)) {
      if (only.length > 0 && !only.includes(name)) continue;
      console.log(`\n\x1b[36m▶ Suite: ${name}\x1b[0m`);
      await run();
    }
  } finally {
    cleanupFixtures();
    await closeQaDb();
  }

  console.log("\n\x1b[36m📊 SUMMARY QA TEST RESULTS\x1b[0m");
  console.table(
    testResults.map((r) => ({ ID: r.id, "Test Name": r.name, Status: r.passed ? "PASSED" : "FAILED", Notes: r.notes }))
  );

  const allPassed = testResults.length > 0 && testResults.every((r) => r.passed);
  console.log(allPassed ? "\n\x1b[32m✔ ALL INTEGRATION QA TESTS PASSED\x1b[0m\n" : "\n\x1b[31m✘ SOME INTEGRATION QA TESTS FAILED\x1b[0m\n");
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error("\n\x1b[31m✘ QA RUNNER CRASHED:\x1b[0m", err);
  process.exit(1);
});
