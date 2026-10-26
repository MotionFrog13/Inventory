import assert from "node:assert/strict";
import { BASE_URL, headersFor, runTest, safeJson } from "../context";

const bodyText = (html: string) => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ");

export async function run() {
  await runTest("I18N-01", "First visit defaults to English regardless of browser language", async () => {
    const response = await fetch(`${BASE_URL}/login`, { headers: { "Accept-Language": "id-ID" } });
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /<html[^>]+lang="en"/);
    assert.ok(bodyText(html).includes("Sign in to your workspace"));
    assert.ok(html.includes("Inventory - Asset Management System"));
    return { passed: true, notes: "English HTML language, sign-in copy and metadata on first response" };
  });

  await runTest("I18N-02", "Indonesian preference and invalid-locale fallback render correctly", async () => {
    for (const [value, language, heading] of [["id", "id", "Masuk ke ruang kerja"], ["invalid", "en", "Sign in to your workspace"]]) {
      const response = await fetch(`${BASE_URL}/login`, { headers: { Cookie: `inventory-language=${value}` } });
      const html = await response.text();
      assert.match(html, new RegExp(`<html[^>]+lang="${language}"`));
      assert.ok(bodyText(html).includes(heading));
    }
    return { passed: true, notes: "Saved Indonesian preference works; invalid preference defaults to English" };
  });

  await runTest("I18N-03", "Authenticated server pages respect the selected language", async () => {
    for (const [path, english, indonesian] of [["/", "Inventory overview", "Ringkasan inventaris"], ["/assets", "All assets", "Daftar Semua Aset"], ["/transfers", "Asset transfer history", "Riwayat Mutasi Aset"]]) {
      for (const [language, heading] of [["en", english], ["id", indonesian]]) {
        const headers = headersFor("SUPER_ADMIN");
        const response = await fetch(`${BASE_URL}${path}`, { headers: { Cookie: `${headers.Cookie}; inventory-language=${language}` } });
        const html = await response.text();
        assert.equal(response.status, 200, path);
        assert.match(html, new RegExp(`<html[^>]+lang="${language}"`));
        assert.ok(bodyText(html).includes(heading), `${path}: ${heading}`);
      }
    }
    return { passed: true, notes: "Dashboard, assets and transfer history render in English and Indonesian" };
  });

  await runTest("I18N-04", "Language preference never widens inventory access or changes user data", async () => {
    const results = [];
    for (const language of ["en", "id"]) {
      const headers = { Cookie: `${headersFor("ADMIN_IT").Cookie}; inventory-language=${language}` };
      const response = await fetch(`${BASE_URL}/api/assets`, { headers });
      assert.equal(response.status, 200);
      results.push((await safeJson(response)).data);
      const otherOrganization = await fetch(`${BASE_URL}/api/assets/asset-b-laptop`, { headers });
      assert.equal(otherOrganization.status, 404);
    }
    assert.deepEqual(results[0], results[1]);
    return { passed: true, notes: "Asset names, quantities and tenant scope are identical in both languages" };
  });

  await runTest("I18N-05", "Monthly reports localize month names without changing totals", async () => {
    const reports = [];
    for (const language of ["en", "id"]) {
      const response = await fetch(`${BASE_URL}/api/reports/monthly`, { headers: { Cookie: `${headersFor("SUPER_ADMIN").Cookie}; inventory-language=${language}` } });
      assert.equal(response.status, 200);
      reports.push((await safeJson(response)).data as { month: string; total: number; resolved: number; unresolved: number }[]);
    }
    assert.ok(reports[0].length > 0);
    assert.deepEqual(reports[0].map(({ total, resolved, unresolved }) => ({ total, resolved, unresolved })), reports[1].map(({ total, resolved, unresolved }) => ({ total, resolved, unresolved })));
    for (const month of reports[0]) assert.match(month.month, /^(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}$/);
    for (const month of reports[1]) assert.match(month.month, /^(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember) \d{4}$/);
    return { passed: true, notes: "Translated month names, identical incident totals" };
  });
}
