import type { AppMode } from "./app-mode";

export function loginAccountKey(identifier: string, orgCode: string, mode: AppMode): string {
  if (identifier.includes("@")) return `email:${identifier}`;
  return `user:${mode === "saas" ? orgCode : ""}:${identifier}`;
}

/** Bounded, per-process login throttling. Multi-instance deployments also need an edge/shared limiter. */
export function createLoginLimiter({
  accountLimit = 10,
  globalLimit = 120,
  windowMs = 15 * 60_000,
  globalWindowMs = 60_000,
}: { accountLimit?: number; globalLimit?: number; windowMs?: number; globalWindowMs?: number } = {}) {
  const accounts = new Map<string, { count: number; expires: number }>();
  let globalCount = 0;
  let globalExpires = 0;
  return {
    /** 0 = allowed; otherwise the number of seconds until another attempt is allowed. */
    consume(key: string, now = Date.now()): number {
      if (now >= globalExpires) {
        globalCount = 0;
        globalExpires = now + globalWindowMs;
      }
      const account = accounts.get(key);
      if (account && now < account.expires && account.count >= accountLimit) {
        return Math.ceil((account.expires - now) / 1000);
      }
      if (globalCount >= globalLimit) return Math.ceil((globalExpires - now) / 1000);
      if (!account && accounts.size >= 10_000) {
        for (const [oldKey, value] of accounts) {
          if (now >= value.expires) accounts.delete(oldKey);
        }
        if (accounts.size >= 10_000) return Math.ceil(windowMs / 1000);
      }
      globalCount++;
      if (!account || now >= account.expires) {
        accounts.set(key, { count: 1, expires: now + windowMs });
      } else {
        account.count++;
      }
      return 0;
    },
  };
}

export const loginLimiter = createLoginLimiter();
