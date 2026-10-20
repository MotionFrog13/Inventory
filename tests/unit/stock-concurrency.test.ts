import { test } from "node:test";
import assert from "node:assert/strict";
import { initialStock, stockMutationWhere } from "../../src/lib/stock";

test("stock writes guard the exact stock snapshot and owning outlet", () => {
  const snapshot = {
    id: "asset", branchId: "outlet", divisionId: "division", status: "ACTIVE" as const,
    updatedAt: new Date("2026-10-14T00:00:00Z"),
    ...initialStock(100, "ACTIVE"),
  };
  assert.deepEqual(stockMutationWhere(snapshot), snapshot);
});
