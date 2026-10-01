import type { NextRequest } from "next/server";
import type { TenantDb } from "./tenant-db";

/**
 * Pelaku aktivitas. `RequestContext` dari requireUserScope() sudah memenuhi
 * bentuk ini, sehingga route cukup memanggil `writeActivityLog(ctx, …)`.
 */
export interface ActivityActor {
  db: TenantDb;
  user: { id: string | null; username: string; organizationId: string };
}

/**
 * Catat log aktivitas ke organisasi pelaku. IP diturunkan dari header
 * `x-forwarded-for` / `x-real-ip` bila `request` diberikan.
 */
export async function writeActivityLog(
  actor: ActivityActor,
  action: string,
  details: string,
  request?: NextRequest
) {
  try {
    let ipAddress: string | null = null;
    if (request) {
      ipAddress = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null;
      if (ipAddress && ipAddress.includes(",")) {
        ipAddress = ipAddress.split(",")[0].trim();
      }
    }

    await actor.db.activityLog.create({
      data: {
        organizationId: actor.user.organizationId,
        userId: actor.user.id,
        username: actor.user.username,
        action,
        details,
        ipAddress,
      },
    });
  } catch (error) {
    console.error("Gagal mencatat log aktivitas:", error);
  }
}
