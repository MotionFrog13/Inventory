import { successResponse, errorResponse } from "@/lib/utils";
import { NextRequest } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant-db";
import { writeActivityLog } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const authUser = getAuthUser(request);

    const response = successResponse(null, "Logout berhasil");

    // Clear the JWT cookie
    const cookieOptions = [
      "token=",
      "HttpOnly",
      "Path=/",
      "Max-Age=0",
      "SameSite=Lax",
    ];
    if (process.env.NODE_ENV === "production") {
      cookieOptions.push("Secure");
    }
    response.headers.set("Set-Cookie", cookieOptions.join("; "));

    if (authUser) {
      await writeActivityLog(
        {
          db: tenantDb(authUser.organizationId),
          user: { id: authUser.userId, username: authUser.username, organizationId: authUser.organizationId },
        },
        "LOGOUT",
        `Pengguna ${authUser.username} berhasil keluar`,
        request
      );
    }

    return response;
  } catch (error) {
    console.error("Logout error:", error);
    return errorResponse("Terjadi kesalahan server", "Logout gagal", 500);
  }
}
