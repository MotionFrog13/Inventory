import { notFound } from "next/navigation";
import { getPageContext } from "@/lib/auth";
import { isAdminRole } from "@/lib/utils";
import { UNASSIGNED_MESSAGE, assetAccessError } from "@/lib/scope";
import AccessDenied from "@/components/AccessDenied";
import EditAssetForm from "./EditAssetForm";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface EditAssetPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditAssetPage({ params }: EditAssetPageProps) {
  const { id } = await params;

  // 1. Konteks request (fail closed bila belum ditugaskan)
  const ctx = await getPageContext();
  if (!ctx) {
    return (
      <AccessDenied
        message={UNASSIGNED_MESSAGE}
        backHref="/login"
        backLabel="Kembali ke Halaman Masuk"
      />
    );
  }
  const { db, scope, user } = ctx;

  // 2. Check if user is admin
  if (!isAdminRole(user.role)) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-6 shadow-xs max-w-lg mx-auto my-10 text-center space-y-3">
        <h2 className="text-lg font-bold">Akses Ditolak</h2>
        <p className="text-sm">Anda tidak memiliki hak akses untuk mengedit spesifikasi aset.</p>
        <Link href={`/assets/${id}`} className="inline-block bg-red-600 text-white font-semibold px-4 py-2 rounded-lg text-sm hover:bg-red-700 transition shadow-xs">
          Kembali ke Detail Aset
        </Link>
      </div>
    );
  }

  // 3. Get asset — aset organisasi lain tidak terlihat oleh client tenant (404)
  const asset = await db.asset.findUnique({
    where: { id },
    include: { division: { select: { name: true } } },
  });

  if (!asset) {
    notFound();
  }

  // 4. Check cross-division & cross-branch access rules
  const accessError = assetAccessError(scope, asset);
  if (accessError) {
    return (
      <AccessDenied
        message={
          accessError.error === "Unauthorized cross-branch access detected."
            ? "Aset ini berada di outlet lain dan tidak dapat diedit."
            : "Anda tidak memiliki akses ke aset di divisi ini."
        }
        backHref="/assets"
        backLabel="← Kembali ke Daftar Aset"
      />
    );
  }

  // 5. Terkunci penuh — hanya ketika SELURUH sisa stok sedang diajukan BAP
  //    (BAP_PENDING) atau stoknya sudah habis dihapus (BAP). BAP parsial
  //    menyisakan stok yang tetap boleh diedit.
  if (asset.status === "BAP_PENDING" || asset.status === "BAP") {
    return (
      <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-6 shadow-xs max-w-lg mx-auto my-10 text-center space-y-3">
        <h2 className="text-lg font-bold">Aset Terkunci</h2>
        <p className="text-sm">
          {asset.status === "BAP"
            ? "Seluruh stok aset ini sudah dihapus melalui BAP dan tidak dapat diedit."
            : "Seluruh sisa stok aset ini sedang menunggu persetujuan BAP, sehingga belum dapat diedit."}
        </p>
        <Link href={`/assets/${id}`} className="inline-block bg-amber-600 text-white font-semibold px-4 py-2 rounded-lg text-sm hover:bg-amber-700 transition shadow-xs">
          Kembali ke Detail Aset
        </Link>
      </div>
    );
  }

  // 6. Cabang (tampilan lokasi saja) dan kategori di divisi aset — kategori
  //    hanya boleh diganti dalam divisi yang sama.
  const [branches, categories] = await Promise.all([
    db.branch.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.category.findMany({
      where: { divisionId: asset.divisionId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <EditAssetForm
      asset={asset}
      branches={branches}
      categories={categories}
      divisionName={asset.division.name}
      userRole={user.role}
    />
  );
}
