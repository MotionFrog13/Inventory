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
  // "/uploads" sengaja TIDAK dilewati: dokumen BAP butuh sesi dan dicek aksesnya
  // oleh /api/uploads (rewrite di next.config.ts).
];

// Header identitas lama wajib dibuang dari setiap request masuk.
// API memverifikasi cookie sendiri; header bukan bukti sesi.
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

export async function proxy(request: NextRequest) {
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
  // Cookie SameSite saja tidak menolak origin berbeda dalam situs yang sama.
  // Origin/Referer dan Fetch Metadata berlaku juga untuk login/logout.
  if (pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
      !MDM_DEVICE_PATHS.includes(pathname)) {
    const source = request.headers.get("origin") ?? request.headers.get("referer");
    let crossOrigin = request.headers.get("sec-fetch-site") === "cross-site";
    if (source !== null) {
      try {
        const target = new URL(request.url);
        // Host tetap diteruskan oleh Docker/Cloudflare Tunnel. Jangan mengambil
        // x-forwarded-host dari pengunjung sebagai daftar origin yang dipercaya.
        const host = request.headers.get("host");
        if (host) target.host = host;
        const forwardedProto = request.headers.get("x-forwarded-proto");
        if (forwardedProto === "https" || forwardedProto === "http") target.protocol = `${forwardedProto}:`;
        crossOrigin ||= new URL(source).origin !== target.origin;
      } catch {
        crossOrigin = true;
      }
    } else if (request.headers.get("sec-fetch-site") === "same-site") {
      crossOrigin = true;
    }
    if (crossOrigin) {
      return NextResponse.json({ success: false, error: "Akses ditolak", message: "Origin permintaan tidak diizinkan." }, { status: 403 });
    }
  }
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

  // Halaman log tetap 403, tetapi keputusan peran berasal dari database.
  if (pathname === "/activity-logs" || pathname.startsWith("/activity-logs/")) {
    const { requireUserScope } = await import("./lib/auth");
    const ctx = await requireUserScope(request);
    if (!ctx.ok || ctx.user.role !== "SUPER_ADMIN") {
      return new NextResponse("Akses ditolak", { status: 403 });
    }
  }

  // Selain guard halaman log di atas, divisi/outlet diperiksa oleh konteks:
  // penugasan bisa berubah setelah
  // login, jadi pengecekannya dibaca dari database oleh requireUserScope() /
  // getPageContext() / /api/auth/me pada setiap request (fail closed).
  // API membaca cookie bertanda tangan sendiri. Jangan meneruskan identitas
  // lewat header (nama Unicode tidak dapat direpresentasikan sebagai ByteString).

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
