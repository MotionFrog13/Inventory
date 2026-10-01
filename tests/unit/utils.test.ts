import { test } from "node:test";
import assert from "node:assert/strict";
import {
  VALID_ROLES,
  branchScopeLabel,
  divisionScopeLabel,
  isAdminRole,
  isValidEmail,
  isValidOrgSlug,
  isValidUsername,
  normalizeEmail,
  normalizeName,
  roleLabel,
} from "../../src/lib/utils";

test("VALID_ROLES berisi tiga tingkat peran", () => {
  assert.deepEqual([...VALID_ROLES], ["SUPER_ADMIN", "DIVISION_ADMIN", "DIVISION_STAFF"]);
});

test("roleLabel menggabungkan tingkat peran dan nama divisi", () => {
  assert.equal(roleLabel("SUPER_ADMIN", "IT"), "Super Admin");
  assert.equal(roleLabel("DIVISION_ADMIN", "Kitchen"), "Admin Kitchen");
  assert.equal(roleLabel("DIVISION_STAFF", "Engineering"), "Staf Engineering");
  assert.equal(roleLabel("DIVISION_ADMIN", null), "Admin Divisi");
  assert.equal(roleLabel("DIVISION_STAFF"), "Staf Divisi");
});

test("isAdminRole hanya untuk SUPER_ADMIN dan DIVISION_ADMIN", () => {
  assert.equal(isAdminRole("SUPER_ADMIN"), true);
  assert.equal(isAdminRole("DIVISION_ADMIN"), true);
  assert.equal(isAdminRole("DIVISION_STAFF"), false);
  assert.equal(isAdminRole("ADMIN_IT"), false); // peran lama tidak dikenali
  assert.equal(isAdminRole(null), false);
});

test("isValidUsername: huruf kecil, angka, . _ -, 3–32 karakter, tanpa @", () => {
  assert.equal(isValidUsername("admin_it"), true);
  assert.equal(isValidUsername("a.b-c_1"), true);
  assert.equal(isValidUsername("ab"), false);
  assert.equal(isValidUsername("Admin"), false);
  assert.equal(isValidUsername("user@demo"), false);
  assert.equal(isValidUsername("a".repeat(33)), false);
});

test("isValidOrgSlug: huruf kecil, angka, tanda hubung, 3–32 karakter", () => {
  assert.equal(isValidOrgSlug("demo"), true);
  assert.equal(isValidOrgSlug("uji-b"), true);
  assert.equal(isValidOrgSlug("ab"), false);
  assert.equal(isValidOrgSlug("Demo"), false);
  assert.equal(isValidOrgSlug("uji_b"), false);
});

test("normalizeEmail dan isValidEmail", () => {
  assert.equal(normalizeEmail("  Admin@Demo.Local "), "admin@demo.local");
  assert.equal(normalizeEmail(""), null);
  assert.equal(normalizeEmail(undefined), null);
  assert.equal(isValidEmail("admin@demo.local"), true);
  assert.equal(isValidEmail("admin@demo"), false);
});

test("normalizeName merapikan spasi dan membatasi panjang", () => {
  assert.equal(normalizeName("  Tablet   POS "), "Tablet POS");
  assert.equal(normalizeName("   "), null);
  assert.equal(normalizeName("x".repeat(61)), null);
  assert.equal(normalizeName(42), null);
});

test("label cakupan divisi & outlet", () => {
  const org = { name: "Demo Resto" };
  assert.equal(divisionScopeLabel({ division: null }), "Semua Divisi");
  assert.equal(divisionScopeLabel({ division: { name: "Kitchen" } }), "Kitchen");
  assert.equal(branchScopeLabel({ role: "SUPER_ADMIN", branches: [], organization: org }), "seluruh cabang Demo Resto");
  assert.equal(branchScopeLabel({ role: "DIVISION_ADMIN", branches: [{ name: "Bogor" }], organization: org }), "outlet Bogor");
  assert.equal(
    branchScopeLabel({ role: "DIVISION_STAFF", branches: [{ name: "Bogor" }, { name: "Jakarta" }], organization: org }),
    "2 outlet (Bogor, Jakarta)"
  );
});
