"use client";
import Image from "next/image";
import UiIcon from "@/components/UiIcon";


import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { AppMode } from "@/lib/app-mode";

const LAST_ORG_KEY = "lastOrgCode";

export default function LoginForm({ mode }: { mode: AppMode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [orgCode, setOrgCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Kode organisasi: dari tautan `/login?org=demo`, atau yang terakhir dipakai.
  useEffect(() => {
    const fromLink = searchParams.get("org");
    let remembered: string | null = null;
    try {
      remembered = localStorage.getItem(LAST_ORG_KEY);
    } catch {
      // localStorage bisa tidak tersedia (mode privat)
    }
    setOrgCode((fromLink || remembered || "").toLowerCase());
  }, [searchParams]);

  // Login dengan email tidak butuh kode organisasi (email unik global).
  const needsOrgCode = mode === "saas" && !identifier.includes("@");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier || !password || (needsOrgCode && !orgCode)) {
      setError(
        needsOrgCode
          ? "Kode organisasi, username, dan password wajib diisi"
          : "Username/email dan password wajib diisi"
      );
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password, orgCode: needsOrgCode ? orgCode : undefined }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error || "Email/username atau password salah");
        setLoading(false);
        return;
      }

      if (needsOrgCode) {
        try {
          localStorage.setItem(LAST_ORG_KEY, orgCode);
        } catch {
          // abaikan — hanya kenyamanan
        }
      }

      // Login berhasil, arahkan ke dashboard
      router.push("/");
      router.refresh();
    } catch (err) {
      console.error("Login request error:", err);
      setError("Terjadi kesalahan koneksi server");
      setLoading(false);
    }
  };

  return (
    <main id="main-content" className="login-bg" tabIndex={-1}>
      <section className="login-story" aria-label="Tentang Inventory">
        <div className="login-brand"><Image src="/logo.svg" width={38} height={38} alt="" />Inventory<span className="ml-1 rounded border border-slate-700 px-2 py-0.5 text-[10px] font-medium tracking-wider text-slate-400">WORKSPACE</span></div>
        <div className="login-story-content">
          <p className="!mb-5 !mt-0 !text-xs font-semibold uppercase tracking-[0.18em] !text-indigo-300">Inventaris yang lebih teratur</p>
          <h2>Semua aset.<br />Satu tempat<br /><span className="text-indigo-300">yang terhubung.</span></h2>
          <p>Pantau kondisi aset, tindak lanjuti insiden, dan kelola perpindahan antar-outlet dengan alur yang jelas.</p>
          <div className="login-features">
            <span><UiIcon name="box" size={18} />Stok dan kondisi aset mudah dipantau</span>
            <span><UiIcon name="transfer" size={18} />Riwayat perpindahan tercatat dengan rapi</span>
            <span><UiIcon name="shield" size={18} />Akses sesuai organisasi dan penugasan</span>
          </div>
        </div>
        <p className="login-story-footer">Dirancang untuk tim lintas divisi dan outlet.</p>
      </section>
      <section className="login-form-area" aria-labelledby="login-heading">
        <div className="login-card">
          <div className="login-brand login-mobile-brand"><Image src="/logo.svg" width={36} height={36} alt="" />Inventory</div>
          <p className="page-eyebrow">Selamat datang kembali</p>
          <h1 id="login-heading" className="page-title !text-3xl">Masuk ke ruang kerja</h1>
          <p className="mt-3 mb-8 text-sm leading-relaxed text-slate-500">Gunakan akun Anda untuk mengakses inventaris organisasi.</p>
          {error && <div role="alert" className="mb-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-700"><UiIcon name="warning" className="mt-0.5 shrink-0" size={17} /><p>{error}</p></div>}
          <form onSubmit={handleSubmit} className="space-y-5" aria-busy={loading}>
            <div>
              <label htmlFor="login-identifier" className="mb-2 block text-xs font-semibold text-slate-700">Email atau username</label>
              <input id="login-identifier" type="text" value={identifier} onChange={(e) => setIdentifier(e.target.value)} disabled={loading} placeholder="nama@organisasi.com atau username" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} className="form-input" aria-describedby="login-identifier-help" required />
              <p id="login-identifier-help" className="mt-2 text-xs leading-relaxed text-slate-500">{mode === "saas" ? "Masuk dengan email tanpa kode organisasi, atau gunakan username dan kode organisasi." : "Gunakan email atau username yang diberikan admin Anda."}</p>
            </div>
            {needsOrgCode && <div>
              <label htmlFor="login-org" className="mb-2 block text-xs font-semibold text-slate-700">Kode organisasi</label>
              <input id="login-org" type="text" value={orgCode} onChange={(e) => setOrgCode(e.target.value.toLowerCase())} disabled={loading} placeholder="Contoh: demo" autoCapitalize="none" autoCorrect="off" spellCheck={false} className="form-input" aria-describedby="login-org-help" required />
              <p id="login-org-help" className="mt-2 text-xs text-slate-500">Minta kode ini kepada admin organisasi Anda.</p>
            </div>}
            <div>
              <label htmlFor="login-password" className="mb-2 block text-xs font-semibold text-slate-700">Password</label>
              <div className="password-field">
                <input id="login-password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading} placeholder="Masukkan password Anda" autoComplete="current-password" className="form-input" required />
                <button type="button" className="password-toggle" disabled={loading} onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"} aria-pressed={showPassword}><UiIcon name={showPassword ? "eyeOff" : "eye"} size={19} /></button>
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn-primary login-submit w-full gap-2 !rounded-xl !mt-6">{loading ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /><span>Sedang masuk...</span></> : <>Masuk ke Inventory<UiIcon name="arrow" size={17} /></>}</button>
          </form>
          <div className="mt-7 flex items-start gap-2 rounded-xl bg-slate-50 p-3.5 text-xs leading-relaxed text-slate-500"><UiIcon name="info" size={16} className="mt-0.5 shrink-0" /><p>Belum memiliki akun atau kesulitan masuk? Hubungi admin organisasi Anda.</p></div>
          <p className="mt-8 text-center text-[11px] text-slate-400">Inventory · Open source · AGPL-3.0</p>
        </div>
      </section>
    </main>
  );
}
