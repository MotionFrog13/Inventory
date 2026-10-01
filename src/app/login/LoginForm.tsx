"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { AppMode } from "@/lib/app-mode";

const LAST_ORG_KEY = "lastOrgCode";

export default function LoginForm({ mode }: { mode: AppMode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
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
    <div className="login-bg flex items-center justify-center min-h-screen">
      <div className="login-card w-full max-w-md bg-white/95 backdrop-blur-md rounded-xl p-8 shadow-2xl border border-white/20">

        {/* Header Logo & Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl overflow-hidden shadow-lg shadow-indigo-500/20 mb-3">
            <img src="/logo.svg" alt="" className="w-full h-full" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Inventory</h1>
          <p className="text-sm text-slate-500 mt-1">Sistem Inventaris Aset Multi-Divisi</p>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-5 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2 animate-pulse">
            <span>⚠️</span>
            <p className="font-medium">{error}</p>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Kode organisasi — hanya mode SaaS dan hanya bila login dengan username */}
          {needsOrgCode && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
                Kode Organisasi
              </label>
              <input
                type="text"
                value={orgCode}
                onChange={(e) => setOrgCode(e.target.value.toLowerCase())}
                disabled={loading}
                placeholder="mis. demo"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="form-input"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
              Username atau Email
            </label>
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              disabled={loading}
              placeholder="Masukkan username atau email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="form-input"
              required
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Password
              </label>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              placeholder="••••••••"
              className="form-input"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full py-3 text-sm font-semibold rounded-lg shadow-md mt-2 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                <span>Memproses Masuk...</span>
              </>
            ) : (
              <span>Masuk Sekarang 🔐</span>
            )}
          </button>
        </form>

        {/* Footer info */}
        <div className="text-center mt-8 text-xs text-slate-400">
          <p>Inventory · Open source di bawah lisensi AGPL-3.0</p>
        </div>
      </div>
    </div>
  );
}
