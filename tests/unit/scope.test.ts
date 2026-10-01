import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assetAccessError,
  assetRelationScopeWhere,
  assetScopeWhere,
  canApproveTransfer,
  canManageCategories,
  canViewTransfer,
  effectiveBranchFilter,
  effectiveDivisionFilter,
  resolveScope,
  transferScopeWhere,
  validateAssignment,
  type UserScope,
} from "../../src/lib/scope";

const ORG = "org-1";
const superAdmin = { role: "SUPER_ADMIN", organizationId: ORG, divisionId: null, branches: [] };
const admin = {
  role: "DIVISION_ADMIN",
  organizationId: ORG,
  divisionId: "div-it",
  branches: [{ id: "br-a" }, { id: "br-b" }],
};
const superScope = resolveScope(superAdmin) as UserScope;
const adminScope = resolveScope(admin) as UserScope;

test("resolveScope: SUPER_ADMIN lintas divisi & outlet, tetap di organisasinya", () => {
  assert.deepEqual(superScope, { organizationId: ORG, divisionId: null, branchIds: null });
});

test("resolveScope: admin divisi terikat divisi dan outletnya", () => {
  assert.deepEqual(adminScope, { organizationId: ORG, divisionId: "div-it", branchIds: ["br-a", "br-b"] });
});

test("resolveScope: tanpa divisi atau tanpa outlet ditolak (fail closed)", () => {
  assert.equal(resolveScope({ ...admin, divisionId: null }), null);
  assert.equal(resolveScope({ ...admin, branches: [] }), null);
});

test("resolveScope: peran tak dikenal ditolak", () => {
  assert.equal(resolveScope({ ...admin, role: "ADMIN_IT" }), null);
});

test("assetScopeWhere & assetRelationScopeWhere", () => {
  assert.deepEqual(assetScopeWhere(adminScope), { divisionId: "div-it", branchId: { in: ["br-a", "br-b"] } });
  assert.deepEqual(assetScopeWhere(superScope), {});
  assert.deepEqual(assetRelationScopeWhere(adminScope), {
    asset: { divisionId: "div-it", branchId: { in: ["br-a", "br-b"] } },
  });
  assert.deepEqual(assetRelationScopeWhere(superScope), {});
});

test("transferScopeWhere: divisi lewat aset + kedua sisi outlet, dibungkus AND", () => {
  assert.deepEqual(transferScopeWhere(adminScope), {
    AND: [
      { asset: { divisionId: "div-it" } },
      { OR: [{ fromBranchId: { in: ["br-a", "br-b"] } }, { toBranchId: { in: ["br-a", "br-b"] } }] },
    ],
  });
  assert.deepEqual(transferScopeWhere(superScope), {});
});

test("canViewTransfer & canApproveTransfer", () => {
  const incoming = { fromBranchId: "br-x", toBranchId: "br-a" };
  const outgoing = { fromBranchId: "br-b", toBranchId: "br-x" };
  assert.equal(canViewTransfer(adminScope, incoming), true);
  assert.equal(canApproveTransfer(adminScope, incoming), false); // hanya outlet asal
  assert.equal(canApproveTransfer(adminScope, outgoing), true);
  assert.equal(canViewTransfer(adminScope, { fromBranchId: "br-x", toBranchId: "br-y" }), false);
  assert.equal(canApproveTransfer(superScope, incoming), true);
});

test("assetAccessError membedakan divisi dan outlet", () => {
  assert.equal(assetAccessError(adminScope, { divisionId: "div-it", branchId: "br-a" }), null);
  assert.equal(
    assetAccessError(adminScope, { divisionId: "div-kitchen", branchId: "br-a" })?.error,
    "Unauthorized cross-division access detected."
  );
  assert.equal(
    assetAccessError(adminScope, { divisionId: "div-it", branchId: "br-x" })?.error,
    "Unauthorized cross-branch access detected."
  );
  assert.equal(assetAccessError(superScope, { divisionId: "div-kitchen", branchId: "br-x" }), null);
});

test("effectiveBranchFilter tidak pernah memperluas akses", () => {
  assert.deepEqual(effectiveBranchFilter(adminScope, "br-b"), ["br-b"]);
  assert.deepEqual(effectiveBranchFilter(adminScope, "br-x"), ["br-a", "br-b"]); // outlet asing diabaikan
  assert.deepEqual(effectiveBranchFilter(adminScope, null), ["br-a", "br-b"]);
  assert.deepEqual(effectiveBranchFilter(superScope, "br-x"), ["br-x"]);
  assert.equal(effectiveBranchFilter(superScope, null), undefined);
});

test("effectiveDivisionFilter hanya dihormati untuk SUPER_ADMIN", () => {
  assert.equal(effectiveDivisionFilter(adminScope, "div-kitchen"), "div-it");
  assert.equal(effectiveDivisionFilter(superScope, "div-kitchen"), "div-kitchen");
  assert.equal(effectiveDivisionFilter(superScope, ""), undefined);
});

test("canManageCategories: SUPER_ADMIN, atau DIVISION_ADMIN divisinya sendiri", () => {
  assert.equal(canManageCategories("SUPER_ADMIN", superScope, "div-kitchen"), true);
  assert.equal(canManageCategories("DIVISION_ADMIN", adminScope, "div-it"), true);
  assert.equal(canManageCategories("DIVISION_ADMIN", adminScope, "div-kitchen"), false);
  const staffScope = { ...adminScope };
  assert.equal(canManageCategories("DIVISION_STAFF", staffScope, "div-it"), false);
});

test("validateAssignment mengikuti peran final", () => {
  assert.deepEqual(validateAssignment("SUPER_ADMIN", "div-it", ["br-a"]), { ok: true, divisionId: null, branchIds: [] });
  assert.equal(validateAssignment("DIVISION_STAFF", "", ["br-a"]).ok, false);
  assert.equal(validateAssignment("DIVISION_STAFF", "div-it", []).ok, false);
  assert.equal(validateAssignment("DIVISION_STAFF", "div-it", "br-a").ok, false);
  assert.deepEqual(validateAssignment("DIVISION_ADMIN", "div-it", ["br-a", "br-a", "br-b"]), {
    ok: true,
    divisionId: "div-it",
    branchIds: ["br-a", "br-b"],
  });
});
