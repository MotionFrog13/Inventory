import { getSessionUser } from "@/lib/auth";
import { resolveScope } from "@/lib/scope";
import { errorResponse, roleLabel, successResponse } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Tetap dapat diakses akun yang BELUM ditugaskan (tidak memakai
// requireUserScope) agar shell aplikasi bisa menampilkan penolakan dan
// tombol keluar, alih-alih pengguna terjebak di sesinya.
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return errorResponse("Tidak terautentikasi", "Gagal", 401);
    }

    return successResponse(
      {
        ...user,
        roleLabel: roleLabel(user.role, user.division?.name),
        access: resolveScope(user) ? "ok" : "unassigned",
      },
      "Data user berhasil diambil"
    );
  } catch (error) {
    console.error("Get current user error:", error);
    return errorResponse("Terjadi kesalahan server", "Gagal", 500);
  }
}
