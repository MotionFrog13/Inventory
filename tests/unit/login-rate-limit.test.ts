import { test } from "node:test";
import assert from "node:assert/strict";
import { createLoginLimiter, loginAccountKey as key } from "../../src/lib/login-rate-limit";

test("login limiter caps attempts per account, expires blocks, and bounds rotated-account traffic", async () => {
  const limiter = createLoginLimiter({ accountLimit: 2, globalLimit: 3, windowMs: 1000, globalWindowMs: 1000 });
  assert.equal(limiter.consume("demo:alice", 0), 0);
  assert.equal(limiter.consume("demo:alice", 1), 0);
  assert.equal(limiter.consume("demo:alice", 2), 1);
  assert.equal(limiter.consume("demo:bob", 3), 0);
  assert.equal(limiter.consume("demo:charlie", 4), 1);
  assert.equal(limiter.consume("demo:alice", 1000), 0);
});

test("self-hosted login buckets ignore client organization codes and email buckets are global", () => {
  assert.equal(key("admin", "one", "self-hosted"), key("admin", "two", "self-hosted"));
  assert.notEqual(key("admin", "one", "saas"), key("admin", "two", "saas"));
  assert.equal(key("admin@example.com", "one", "saas"), key("admin@example.com", "two", "saas"));
});
