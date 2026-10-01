import { Suspense } from "react";
import { getAppMode } from "@/lib/app-mode";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

// Mode dibaca di server agar klien tidak perlu endpoint tambahan: mode SaaS
// menampilkan kolom kode organisasi, self-hosted menyembunyikannya.
// `LoginForm` memakai useSearchParams (tautan `?org=`), sehingga dibungkus
// Suspense sesuai rekomendasi Next.js.
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm mode={getAppMode()} />
    </Suspense>
  );
}
