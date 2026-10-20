import { test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";

process.env.JWT_SECRET = "unit-test-secret-not-for-production";
const security = import("../../src/lib/jwt");
const middleware = import("../../src/proxy");
const payload = { userId: "user", organizationId: "org", role: "DIVISION_STAFF", name: "Staff", username: "staff" };

test("JWT rejects signed tokens with missing or malformed identity fields", async () => {
  const { verifyToken } = await security;
  for (const field of Object.keys(payload)) {
    for (const value of [undefined, null, "", 42, {}]) {
      const token = jwt.sign({ ...payload, [field]: value }, process.env.JWT_SECRET!);
      assert.equal(verifyToken(token), null, `${field}=${JSON.stringify(value)}`);
    }
  }
  assert.equal(verifyToken(jwt.sign({ ...payload, role: "ADMIN_IT" }, process.env.JWT_SECRET!)), null);
});

test("JWT only accepts the configured signing algorithm", async () => {
  const { verifyToken, signToken } = await security;
  assert.equal(verifyToken(jwt.sign(payload, process.env.JWT_SECRET!, { algorithm: "HS384" })), null);
  assert.equal(verifyToken(signToken(payload))?.userId, payload.userId);
});

test("API mutations reject cross-origin browser requests including login and sibling subdomains", async () => {
  const { proxy } = await middleware;
  for (const path of ["/api/auth/login", "/api/auth/logout", "/api/assets/a/bap"]) {
    for (const origin of ["https://attacker.example", "https://other.inventory.example", "null"]) {
      const request = new NextRequest(`https://inventory.example${path}`, {
        method: "POST", headers: { origin, "sec-fetch-site": "same-site" },
      });
      assert.equal((await proxy(request)).status, 403, `${path}: ${origin}`);
    }
  }
});

test("same-origin requests and non-browser API clients remain supported", async () => {
  const { proxy } = await middleware;
  for (const headers of [new Headers({ origin: "https://inventory.example" }), new Headers()]) {
    assert.equal((await proxy(new NextRequest("https://inventory.example/api/auth/login", { method: "POST", headers }))).status, 200);
  }
  assert.equal((await proxy(new NextRequest("https://inventory.example/api/auth/login", {
    method: "POST", headers: { "sec-fetch-site": "cross-site" },
  }))).status, 403);
});

test("proxy accepts a valid stale role token so API authorization uses the current database role", async () => {
  const { proxy } = await middleware;
  const { signToken } = await security;
  const response = await proxy(new NextRequest("https://inventory.example/api/activity-logs", {
    headers: { cookie: `token=${signToken(payload)}` },
  }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-middleware-request-x-user-id"), null);
});

test("request authentication rejects forged identity headers without a signed cookie", async () => {
  const { getAuthUser } = await import("../../src/lib/auth");
  assert.equal(getAuthUser(new NextRequest("https://inventory.example/api/assets", {
    headers: { "x-user-id": "victim", "x-user-org": "org", "x-user-role": "SUPER_ADMIN", "x-user-name": "Admin" },
  })), null);
});

test("Unicode user names do not break authenticated requests", async () => {
  const { proxy } = await middleware;
  const { signToken } = await security;
  assert.equal((await proxy(new NextRequest("https://inventory.example/api/assets", {
    headers: { cookie: `token=${signToken({ ...payload, name: "测试" })}` },
  }))).status, 200);
});
