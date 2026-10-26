import assert from "node:assert/strict";
import { test } from "node:test";
import english from "../../src/lib/i18n/en.json";
import { createTranslator, DEFAULT_LOCALE, intlLocale, resolveLocale, translate } from "../../src/lib/i18n";
import { branchScopeLabel, divisionScopeLabel, formatDate, roleLabel } from "../../src/lib/utils";

test("English is the default; only the explicit Indonesian preference opts out", () => {
  assert.equal(DEFAULT_LOCALE, "en");
  for (const value of [undefined, null, "", "fr", "ID", "<script>"]) assert.equal(resolveLocale(value), "en");
  assert.equal(resolveLocale("id"), "id");
  assert.equal(intlLocale("en"), "en-GB");
  assert.equal(intlLocale("id"), "id-ID");
  assert.equal(createTranslator("en")("Masuk ke ruang kerja"), "Sign in to your workspace");
  assert.equal(createTranslator("id")("Masuk ke ruang kerja"), "Masuk ke ruang kerja");
});

test("translations retain interpolation values and translate dynamic API errors", () => {
  const name = "Aset <Kitchen> $& {99}";
  assert.equal(translate('Hapus divisi "{0}"?', "en", [name]), `Delete division "${name}"?`);
  assert.equal(translate('Hapus divisi "{0}"?', "id", [name]), `Hapus divisi "${name}"?`);
  assert.equal(translate("Jumlah rusak (12 pcs) melebihi stok yang tersedia (8 pcs)", "en"), "The damaged quantity (12 pcs) exceeds available stock (8 pcs)");
  assert.equal(translate("Unknown diagnostic message", "en"), "Unknown diagnostic message");
  assert.equal(translate("Path", "en"), "Path");
  assert.equal(translate("Semua aman &amp; terkendali!", "id"), "Semua aman & terkendali!");
  assert.equal(translate("&ldquo;", "id"), "“");
});

test("all translated messages preserve their interpolation placeholders", () => {
  for (const [source, translated] of Object.entries(english)) {
    const placeholders = (value: string) => [...new Set(value.match(/\{\d+\}/g) ?? [])].sort();
    assert.deepEqual(placeholders(translated), placeholders(source), source);
    assert.ok(translated.trim().length > 0, source);
  }
});

test("localized formatting preserves names and Jakarta calendar dates", () => {
  const user = { role: "SUPER_ADMIN", division: null, branches: [], organization: { name: "Aktif" } };
  assert.equal(divisionScopeLabel(user, "en"), "All divisions");
  assert.equal(divisionScopeLabel({ division: { name: "Aktif" } }, "en"), "Aktif");
  assert.equal(branchScopeLabel(user, "en"), "all outlets of Aktif");
  assert.equal(roleLabel("DIVISION_STAFF", "Aktif", "en"), "Aktif Staff");
  assert.equal(roleLabel("DIVISION_STAFF", "Aktif", "id"), "Staf Aktif");
  assert.equal(roleLabel("DIVISION_ADMIN", null, "en"), "Division Admin");
  assert.equal(formatDate("2026-07-31T18:00:00Z", "en"), "1 Aug 2026");
  assert.equal(formatDate("2026-07-31T18:00:00Z", "id"), "1 Agu 2026");
});
