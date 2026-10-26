// Real clean-volume installation test. Requires only Docker Compose + Node.
// A unique project isolates this run from all existing installations.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

const project = `inventory-smoke-${randomUUID().slice(0, 8)}`;
const port = process.env.SMOKE_PORT || "18080";
const base = `http://localhost:${port}`;
const env = {
  ...process.env,
  PROD_PORT: port,
  PROD_APP_MODE: "self-hosted",
  ORG_NAME: "Install smoke test",
  ORG_SLUG: "install-smoke",
  ADMIN_USERNAME: "superadmin",
  ADMIN_EMAIL: "admin@install-smoke.local",
  ADMIN_PASSWORD: "",
  CLOUDFLARE_TUNNEL_TOKEN: "",
  CLOUDFLARE_QUICK_TUNNEL: "false",
};
let password;
const redact = (s) => password ? s.replaceAll(password, "[redacted]") : s;
function compose(args, capture = false) {
  return execFileSync("docker", ["compose", "-p", project, ...args], {
    env,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    timeout: 20 * 60 * 1000,
    maxBuffer: 10 * 1024 * 1024,
  });
}
async function ready() {
  for (let i = 0; i < 120; i++) {
    try {
      const response = await fetch(`${base}/api/auth/me`, { signal: AbortSignal.timeout(3000) });
      if (response.status === 401) return;
    } catch { /* startup can briefly refuse connections */ }
    await delay(2000);
  }
  throw new Error("Application did not become ready");
}
async function login() {
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({ username: "superadmin", password }),
  });
  assert.equal(response.status, 200, "Fresh admin must be able to log in");
  const cookie = response.headers.get("set-cookie");
  assert.ok(cookie?.includes("HttpOnly"), "Login must set an HTTP-only cookie");
  assert.ok(cookie.includes("Secure"), "Production cookie must be Secure");
  const me = await fetch(`${base}/api/auth/me`, { headers: { Cookie: cookie.split(";")[0] } });
  assert.equal(me.status, 200, "Admin session must authenticate");
}
try {
  console.log(`Testing fresh installation in isolated project ${project}`);
  compose(["up", "-d", "--build", "--wait", "--wait-timeout", "600"]);
  await ready();
  const logs = compose(["logs", "--no-color", "--no-log-prefix", "app"], true);
  password = logs.match(/Password Super Admin pertama\s*:\s*(\S+)/)?.[1];
  assert.ok(password?.length >= 8, "First boot must generate an admin password");
  await login();
  const snapshot = () => compose([
    "exec", "-T", "app", "gosu", "postgres", "psql", "-d", "inventory", "-tAX", "-c",
    'SELECT (SELECT count(*) FROM "Organization"), (SELECT count(*) FROM "User"), (SELECT count(*) FROM "Asset"), (SELECT id FROM "Organization" LIMIT 1), (SELECT password FROM "User" LIMIT 1)',
  ], true).trim();
  const before = snapshot();
  assert.ok(before.startsWith("1|1|0|"), "Production must create one organization/admin and no demo assets");
  compose(["exec", "-T", "app", "sh", "-c", "printf install-persisted > /data/uploads/install-smoke.txt"]);
  compose(["down"]);
  compose(["up", "-d", "--wait", "--wait-timeout", "180"]);
  await ready();
  assert.equal(snapshot(), before, "Recreation must preserve organization, users and password");
  assert.equal(compose(["exec", "-T", "app", "cat", "/data/uploads/install-smoke.txt"], true), "install-persisted");
  await login();
  console.log("PASS: clean install, migrations, random admin login, production cookie and data/upload persistence");
} catch (error) {
  console.error(redact(error.message));
  try {
    const logs = compose(["logs", "--no-color", "--tail", "100", "app"], true);
    console.error(redact(logs.replace(/(Password Super Admin pertama\s*:)\s*\S+/g, "$1 [redacted]")));
  } catch { /* build may have failed before creating a container */ }
  process.exitCode = 1;
} finally {
  // Only the unique project created above is ever removed.
  compose(["down", "-v", "--remove-orphans"]);
}
