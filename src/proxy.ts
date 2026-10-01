import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "./lib/jwt";
import { VALID_ROLES } from "./lib/utils";

// Routes yang tidak memerlukan autentikasi (cookie JWT)
const PUBLIC_PATHS = ["/login", "/api/auth/login"];

// Routes MDM device agent — melewati cookie auth. Selama Fase 1 route ini
// hanya membalas 404 (fitur MDM dinonaktifkan, lihat src/lib/mdm.ts).
const MDM_DEVICE_PATHS = ["/api/mdm/enroll", "/api/mdm/check-in"];

// Static file patterns yang di-skip
const SKIP_PATTERNS = [
  "/_next",
  "/_global-error",
  "/_not-found",
  "/favicon.ico",
  // Logo & ikon aplikasi — dipakai halaman login sebelum pengguna masuk.
  "/logo.svg",
  "/icon.svg",
  "/icon.png",
  "/apple-icon.png",
  "/icons",
  "/images",
  "/uploads",
];

// Header identitas yang HANYA boleh diisi oleh middleware ini.
// Wajib dibuang dari setiap request masuk agar klien tidak bisa memalsukan sesi.
const IDENTITY_HEADERS = ["x-user-id", "x-user-org", "x-user-role", "x-user-name", "x-user-username"];

function invalidSession(request: NextRequest, pathname: string) {
  const response = pathname.startsWith("/api/")
    ? NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
          message: "Sesi Anda sudah tidak berlaku. Silakan masuk kembali.",
        },
        { status: 401 }
      )
    : NextResponse.redirect(new URL("/login", request.url));
  response.cookies.delete("token");
  return response;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Buang header identitas bawaan klien SEBELUM percabangan apa pun.
  const requestHeaders = new Headers(request.headers);
  for (const header of IDENTITY_HEADERS) {
    requestHeaders.delete(header);
  }
  const sanitized = () => NextResponse.next({ request: { headers: requestHeaders } });

  // Hanya bergantung pada env var server-side — header `x-next-prerender`
  // dapat dikirim siapa pun sehingga tidak dapat dipercaya.
  if (process.env.NEXT_PHASE === "phase-production-build") return sanitized();
  if (SKIP_PATTERNS.some((pattern) => pathname.startsWith(pattern))) return sanitized();
  if (MDM_DEVICE_PATHS.some((path) => pathname.startsWith(path))) return sanitized();
  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) return sanitized();

  const token = request.cookies.get("token")?.value;
  if (!token) {
    if (!pathname.startsWith("/api/")) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.json(
      { success: false, error: "Unauthorized", message: "Token tidak ditemukan" },
      { status: 401 }
    );
  }

  // Token wajib: tanda tangan sah, peran termasuk 3 tingkat yang berlaku, dan
  // memuat organisasi. Token format lama (peran ADMIN_IT/KITCHEN, atau tanpa
  // organizationId) dianggap tidak valid — pengguna login ulang, bukan diteruskan.
  const payload = verifyToken(token);
  if (
    !payload ||
    !(VALID_ROLES as readonly string[]).includes(payload.role) ||
    typeof payload.organizationId !== "string" ||
    payload.organizationId === ""
  ) {
    return invalidSession(request, pathname);
  }

  // Activity log hanya untuk SUPER_ADMIN (pemeriksaan dini; route juga
  // memeriksa peran dari database).
  if (pathname.startsWith("/activity-logs") || pathname.startsWith("/api/activity-logs")) {
    if (payload.role !== "SUPER_ADMIN") {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { success: false, error: "Akses ditolak", message: "Akses ditolak" },
          { status: 403 }
        );
      }
      return new NextResponse("Akses ditolak", { status: 403 });
    }
  }

  // Divisi & outlet TIDAK diperiksa di sini: penugasan bisa berubah setelah
  // login, jadi pengecekannya dibaca dari database oleh requireUserScope() /
  // getPageContext() / /api/auth/me pada setiap request (fail closed).
  requestHeaders.set("x-user-id", payload.userId);
  requestHeaders.set("x-user-org", payload.organizationId);
  requestHeaders.set("x-user-role", payload.role);
  requestHeaders.set("x-user-name", payload.name);
  requestHeaders.set("x-user-username", payload.username);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
