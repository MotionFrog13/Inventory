"use client";
import UiIcon from "@/components/UiIcon";
import PageHeading from "@/components/PageHeading";
import GuideCard from "@/components/GuideCard";
import Dialog from "@/components/Dialog";


export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import { ROLE_TIER_LABELS, VALID_ROLES } from "@/lib/utils";

interface User {
  id: string;
  username: string;
  name: string;
  email: string | null;
  role: string;
  roleLabel: string;
  divisionId: string | null;
  division: { id: string; name: string } | null;
  /** Outlet penugasan; kosong hanya sah untuk SUPER_ADMIN (lintas outlet) */
  branches: { id: string; name: string }[];
  createdAt: string;
}

interface Option {
  id: string;
  name: string;
}

interface UserFormState {
  name: string;
  username: string;
  email: string;
  password: string;
  role: string;
  divisionId: string;
  branchIds: string[];
}

const EMPTY_FORM: UserFormState = {
  name: "",
  username: "",
  email: "",
  password: "",
  role: "DIVISION_STAFF",
  divisionId: "",
  branchIds: [],
};

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("id-ID", {
    day: "numeric", month: "short", year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: "bg-purple-100 text-purple-800 border border-purple-200",
  DIVISION_ADMIN: "bg-indigo-100 text-indigo-800 border border-indigo-200",
  DIVISION_STAFF: "bg-blue-100 text-blue-800 border border-blue-200",
};

const inputClass =
  "w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 ease-in-out";
const labelClass = "block text-sm font-semibold text-slate-700 mb-1.5";

/**
 * Validasi sisi klien yang sama arahnya dengan `validateAssignment()` di
 * server: selain Super Admin wajib punya divisi DAN minimal satu outlet (akun
 * tanpa keduanya langsung terkunci); Super Admin wajib punya email.
 */
function formError(form: UserFormState): string | null {
  if (form.role === "SUPER_ADMIN") {
    return form.email.trim() ? null : "Email wajib diisi untuk Super Admin.";
  }
  if (!form.divisionId) return "Divisi wajib dipilih untuk peran selain Super Admin.";
  if (form.branchIds.length === 0) return "Minimal satu outlet wajib dipilih untuk peran selain Super Admin.";
  return null;
}

function toPayload(form: UserFormState) {
  const isSuper = form.role === "SUPER_ADMIN";
  return {
    name: form.name,
    username: form.username,
    email: form.email.trim() || null,
    role: form.role,
    ...(form.password ? { password: form.password } : {}),
    // Super Admin lintas divisi & outlet — penugasan tidak dikirim.
    ...(isSuper ? {} : { divisionId: form.divisionId, branchIds: form.branchIds }),
  };
}

function UserFormFields({
  form,
  setForm,
  divisions,
  branches,
  isEdit,
}: {
  form: UserFormState;
  setForm: (updater: (f: UserFormState) => UserFormState) => void;
  divisions: Option[];
  branches: Option[];
  isEdit: boolean;
}) {
  const isSuper = form.role === "SUPER_ADMIN";

  function toggleBranch(id: string) {
    setForm((f) => ({
      ...f,
      branchIds: f.branchIds.includes(id) ? f.branchIds.filter((b) => b !== id) : [...f.branchIds, id],
    }));
  }

  return (
    <>
      <div>
        <label htmlFor="users-page-field-1" className={labelClass}>Nama Lengkap <span className="text-red-500">*</span></label>
        <input id="users-page-field-1"
          type="text"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          required
          placeholder="Contoh: Budi Santoso"
          className={inputClass}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="users-page-field-2" className={labelClass}>Username <span className="text-red-500">*</span></label>
          <input id="users-page-field-2"
            type="text"
            value={form.username}
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value.toLowerCase() }))}
            required
            placeholder="budi.santoso"
            className={`${inputClass} font-mono`}
          />
          <p className="text-xs text-slate-400 mt-1">Huruf kecil, angka, titik, _ atau -. Tanpa @.</p>
        </div>
        <div>
          <label htmlFor="users-page-field-3" className={labelClass}>
            Email {isSuper ? <span className="text-red-500">*</span> : <span className="text-slate-400 font-normal">(opsional)</span>}
          </label>
          <input id="users-page-field-3"
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            required={isSuper}
            placeholder="nama@perusahaan.com"
            className={inputClass}
          />
        </div>
      </div>
      <div>
        <label htmlFor="users-page-field-4" className={labelClass}>
          {isEdit ? <>Password Baru <span className="text-slate-400 font-normal">(Opsional)</span></> : <>Password <span className="text-red-500">*</span></>}
        </label>
        <input id="users-page-field-4"
          type="password"
          value={form.password}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          required={!isEdit}
          minLength={6}
          placeholder={isEdit ? "Kosongkan jika tidak diubah" : "Minimal 6 karakter"}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="users-page-field-5" className={labelClass}>Peran</label>
        <select id="users-page-field-5"
          value={form.role}
          onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
          className={inputClass}
        >
          {VALID_ROLES.map((r) => (
            <option key={r} value={r}>{ROLE_TIER_LABELS[r]}</option>
          ))}
        </select>
      </div>

      {/* Divisi & outlet — hanya untuk peran selain Super Admin, yang memang
          lintas divisi dan lintas outlet. */}
      {!isSuper && (
        <>
          <div>
            <label htmlFor="users-page-field-6" className={labelClass}>Divisi <span className="text-red-500">*</span></label>
            <select id="users-page-field-6"
              value={form.divisionId}
              onChange={(e) => setForm((f) => ({ ...f, divisionId: e.target.value }))}
              required
              className={`${inputClass} ${form.divisionId ? "" : "border-red-400 focus:ring-red-500/20"}`}
            >
              <option value="">Pilih Divisi...</option>
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Outlet Penugasan <span className="text-red-500">*</span></label>
            <div className={`border rounded-lg p-3 space-y-2 max-h-44 overflow-y-auto ${form.branchIds.length ? "border-slate-200" : "border-red-400"}`}>
              {branches.map((b) => (
                <label key={b.id} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.branchIds.includes(b.id)}
                    onChange={() => toggleBranch(b.id)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/20"
                  />
                  {b.name}
                </label>
              ))}
            </div>
            {form.branchIds.length === 0 ? (
              <p className="text-red-500 text-xs mt-1">Akun tanpa outlet tidak dapat mengakses data apa pun.</p>
            ) : (
              <p className="text-xs text-slate-400 mt-1">
                Pengguna hanya melihat aset, insiden, dan transfer divisinya di outlet yang dipilih.
              </p>
            )}
          </div>
        </>
      )}
    </>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [branches, setBranches] = useState<Option[]>([]);
  const [divisions, setDivisions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);

  // Modal: Tambah User
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState<UserFormState>(EMPTY_FORM);
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Modal: Edit User
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState<UserFormState>(EMPTY_FORM);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Modal: Hapus Konfirmasi
  const [deleteUser, setDeleteUser] = useState<User | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      if (data.success) setUsers(data.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    // Ambil info user saat ini untuk proteksi hapus diri sendiri
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.success) {
        setCurrentUserId(d.data.id);
        setCurrentUserRole(d.data.role);
      }
    });
    // `?all=1` — halaman ini hanya untuk Super Admin, yang perlu melihat
    // seluruh outlet organisasi untuk menugaskan pengguna.
    fetch("/api/branches?all=1").then(r => r.json()).then(d => {
      if (d.success) setBranches(d.data);
    });
    fetch("/api/divisions").then(r => r.json()).then(d => {
      if (d.success) setDivisions(d.data);
    });
  }, [fetchUsers]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const invalid = formError(addForm);
    if (invalid) {
      setAddError(invalid);
      return;
    }
    setAddLoading(true);
    setAddError(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(addForm)),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setAddError(data.error || "Gagal menambah pengguna.");
        return;
      }
      setShowAddModal(false);
      setAddForm(EMPTY_FORM);
      fetchUsers();
    } catch {
      setAddError("Terjadi kesalahan jaringan.");
    } finally {
      setAddLoading(false);
    }
  }

  function openEdit(user: User) {
    setEditUser(user);
    setEditForm({
      name: user.name,
      username: user.username,
      email: user.email ?? "",
      password: "",
      role: user.role,
      divisionId: user.divisionId ?? "",
      branchIds: user.branches.map((b) => b.id),
    });
    setEditError(null);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editUser) return;
    // Menurunkan Super Admin ke peran lain WAJIB disertai divisi & outlet —
    // tanpa itu akun hasil perubahan langsung terkunci total.
    const invalid = formError(editForm);
    if (invalid) {
      setEditError(invalid);
      return;
    }
    setEditLoading(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/users/${editUser.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(editForm)),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setEditError(data.error || "Gagal memperbarui pengguna.");
        return;
      }
      setEditUser(null);
      fetchUsers();
    } catch {
      setEditError("Terjadi kesalahan jaringan.");
    } finally {
      setEditLoading(false);
    }
  }

  async function handleDelete() {
    if (!deleteUser) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/users/${deleteUser.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setDeleteError(data.error || "Gagal menghapus pengguna.");
        return;
      }
      setDeleteUser(null);
      fetchUsers();
    } catch {
      setDeleteError("Terjadi kesalahan jaringan.");
    } finally {
      setDeleteLoading(false);
    }
  }

  // Halaman ini khusus Super Admin
  if (!loading && currentUserRole && currentUserRole !== "SUPER_ADMIN") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="text-6xl"><UiIcon size={40} name="lock" className="inline-block align-middle" /></div>
        <h1 className="page-title">Akses Ditolak</h1>
        <p className="text-slate-500">Halaman ini hanya dapat diakses oleh Super Admin.</p>
      </div>
    );
  }

  const submitButton = (busy: boolean, label: string, busyLabel: string) => (
    <button
      type="submit"
      disabled={busy}
      className="flex-1 inline-flex items-center justify-center gap-2 bg-indigo-600 text-white font-semibold py-2.5 rounded-lg text-sm hover:bg-indigo-700 active:scale-[0.98] transition-all duration-200 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {busy && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
      {busy ? busyLabel : label}
    </button>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <PageHeading eyebrow="Administrasi" title={<>Manajemen Pengguna</>} description={<>Kelola akun, peran, divisi, dan outlet pengguna organisasi Anda.</>} />
        <button
          id="btn-add-user"
          onClick={() => { setShowAddModal(true); setAddError(null); setAddForm(EMPTY_FORM); }}
          className="bg-indigo-600 text-white font-semibold px-4 py-2.5 rounded-lg text-sm hover:bg-indigo-700 active:scale-[0.98] transition-all duration-200 ease-in-out shadow-sm flex items-center gap-2"
        >
          + Tambah Pengguna
        </button>
      </div>
      <GuideCard title="Pastikan penugasan akun lengkap" icon="users">Admin dan staf divisi memerlukan satu divisi dan minimal satu outlet. Super Admin memiliki akses organisasi dan wajib menggunakan email.</GuideCard>


      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="ui-panel bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Total Pengguna</p>
          <p className="text-3xl font-bold text-slate-900">{users.length}</p>
        </div>
        <div className="ui-panel bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Admin</p>
          <p className="text-3xl font-bold text-purple-700">{users.filter(u => u.role === "SUPER_ADMIN" || u.role === "DIVISION_ADMIN").length}</p>
        </div>
        <div className="ui-panel bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Staf</p>
          <p className="text-3xl font-bold text-blue-700">{users.filter(u => u.role === "DIVISION_STAFF").length}</p>
        </div>
      </div>

      {/* Table */}
      <div className="ui-panel bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-16 flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin"></div>
            <p className="text-sm text-slate-500">Memuat data pengguna...</p>
          </div>
        ) : users.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-5xl mb-3"><UiIcon size={40} name="users" className="inline-block align-middle" /></div>
            <p className="font-semibold text-slate-700">Belum ada pengguna</p>
            <p className="text-xs text-slate-400 mt-1">Tambahkan pengguna baru untuk memulai.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="inventory-table w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 py-3.5">Nama</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 py-3.5">Username</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 py-3.5">Email</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 py-3.5">Peran</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 py-3.5">Outlet</th>
                  <th className="hidden 2xl:table-cell text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 py-3.5">Terdaftar</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 py-3.5">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user) => {
                  const unassigned = user.role !== "SUPER_ADMIN" && (!user.divisionId || user.branches.length === 0);
                  return (
                    <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-3 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm flex-shrink-0">
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-semibold text-slate-900">
                            {user.name}
                            {user.id === currentUserId && <span className="text-xs text-slate-400 font-normal ml-1">(Anda)</span>}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-4 font-mono text-slate-600 text-sm">{user.username}</td>
                      <td className="px-3 py-4 text-slate-600">{user.email || <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-4">
                        <span className={`inline-block whitespace-nowrap text-xs font-bold px-2.5 py-1 rounded-full ${ROLE_COLORS[user.role] || "bg-slate-100 text-slate-700"}`}>
                          {user.roleLabel}
                        </span>
                      </td>
                      {/* Outlet — akun non-Super Admin tanpa penugasan TIDAK dapat
                          mengakses apa pun, jadi ditandai mencolok. */}
                      <td className="px-3 py-4">
                        {user.role === "SUPER_ADMIN" ? (
                          <span className="inline-block whitespace-nowrap text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200/60">
                            Semua outlet
                          </span>
                        ) : unassigned ? (
                          <span className="inline-block whitespace-nowrap text-xs font-semibold px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200/60">
                            <UiIcon name="warning" className="inline-block align-middle" /> Belum ditugaskan
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {user.branches.map((b) => (
                              <span key={b.id} className="whitespace-nowrap text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                                {b.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="hidden 2xl:table-cell px-3 py-4 text-slate-500 whitespace-nowrap">{formatDate(user.createdAt)}</td>
                      <td className="px-3 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEdit(user)}
                            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline transition px-2 py-1 rounded hover:bg-indigo-50"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => { setDeleteUser(user); setDeleteError(null); }}
                            disabled={user.id === currentUserId}
                            className="text-xs font-semibold text-red-600 hover:text-red-800 hover:underline transition px-2 py-1 rounded hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline"
                            title={user.id === currentUserId ? "Tidak dapat menghapus akun Anda sendiri" : "Hapus pengguna"}
                          >
                            Hapus
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Tambah User */}
      {showAddModal && (
        <Dialog label="Tambah Pengguna Baru" onClose={() => setShowAddModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-1">Tambah Pengguna Baru</h2>
              <p className="text-sm text-slate-500 mb-5">Buat akun baru dan tentukan peran, divisi, serta outletnya.</p>
              <form onSubmit={handleAdd} className="space-y-4">
                {addError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{addError}</div>
                )}
                <UserFormFields form={addForm} setForm={setAddForm} divisions={divisions} branches={branches} isEdit={false} />
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 bg-slate-100 text-slate-700 font-semibold py-2.5 rounded-lg text-sm hover:bg-slate-200 transition">
                    Batal
                  </button>
                  {submitButton(addLoading, "Tambah Pengguna", "Menyimpan...")}
                </div>
              </form>
            </div>
          </div>
        </Dialog>
      )}

      {/* Modal: Edit User */}
      {editUser && (
        <Dialog label="Edit Pengguna" onClose={() => setEditUser(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-1">Edit Pengguna</h2>
              <p className="text-sm text-slate-500 mb-5">Perbarui informasi akun <strong>{editUser.name}</strong>. Kosongkan field password jika tidak ingin mengubahnya.</p>
              <form onSubmit={handleEdit} className="space-y-4">
                {editError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{editError}</div>
                )}
                <UserFormFields form={editForm} setForm={setEditForm} divisions={divisions} branches={branches} isEdit />
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setEditUser(null)} className="flex-1 bg-slate-100 text-slate-700 font-semibold py-2.5 rounded-lg text-sm hover:bg-slate-200 transition">
                    Batal
                  </button>
                  {submitButton(editLoading, "Simpan Perubahan", "Menyimpan...")}
                </div>
              </form>
            </div>
          </div>
        </Dialog>
      )}

      {/* Modal: Konfirmasi Hapus */}
      {deleteUser && (
        <Dialog label="Hapus Pengguna?" onClose={() => setDeleteUser(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="p-6">
              <div className="text-4xl mb-3"><UiIcon name="warning" className="inline-block align-middle" /></div>
              <h2 className="text-lg font-bold text-slate-900 mb-1">Hapus Pengguna?</h2>
              <p className="text-sm text-slate-500 mb-4">
                Akun <strong>{deleteUser.name}</strong> ({deleteUser.username}) akan dihapus secara permanen. Tindakan ini tidak dapat dibatalkan.
              </p>
              {deleteError && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm mb-4">{deleteError}</div>
              )}
              <div className="flex gap-3">
                <button onClick={() => setDeleteUser(null)} className="flex-1 bg-slate-100 text-slate-700 font-semibold py-2.5 rounded-lg text-sm hover:bg-slate-200 transition">
                  Batal
                </button>
                <button onClick={handleDelete} disabled={deleteLoading} className="flex-1 bg-red-600 text-white font-semibold py-2.5 rounded-lg text-sm hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed">
                  {deleteLoading ? "Menghapus..." : "Ya, Hapus"}
                </button>
              </div>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
