import { BASE_URL, headersFor, jsonHeaders, recordResult, runTest, safeJson } from "../context";

export async function run() {
  // TC-RBAC-03 — staf tidak dapat menyetujui transfer (peran dicek sebelum
  // keberadaan transfer, sehingga ID fiktif pun ditolak 403).
  try {
    const res = await fetch(`${BASE_URL}/api/transfers/some-pending-transfer-id/approve`, {
      method: "POST",
      headers: headersFor("STAFF_IT"),
    });
    const passed = res.status === 403;
    recordResult(
      "RBAC-03",
      "Staff (STAFF_IT) cannot approve transfers",
      passed,
      passed ? "Correctly blocked with 403" : `Failed with status ${res.status}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordResult("RBAC-03", "Staff (STAFF_IT) cannot approve transfers", false, message);
  }

  // TC-MUT-01 — pengajuan tidak memindahkan aset; persetujuan memindahkannya
  // di dalam transaksi. Dijalankan sebagai SUPER_ADMIN (lintas outlet) atas aset
  // Bandung; aset dikembalikan ke Bandung di akhir agar suite bisa diulang.
  const transferAssetId = "asset-ups-bandung";
  try {
    const reqRes = await fetch(`${BASE_URL}/api/assets/${transferAssetId}/transfer`, {
      method: "POST",
      headers: jsonHeaders("SUPER_ADMIN"),
      body: JSON.stringify({ toBranchId: "branch-bogor", reason: "Testing transfer approval" }),
    });
    const reqData = await safeJson(reqRes);
    if (reqRes.status !== 201) {
      throw new Error(`Transfer request failed: ${reqRes.status} ${JSON.stringify(reqData)}`);
    }

    const transferId = reqData?.data?.id;
    if (!transferId) {
      throw new Error("No transfer ID returned in request response.");
    }

    const checkData = await safeJson(
      await fetch(`${BASE_URL}/api/assets/${transferAssetId}`, { headers: headersFor("SUPER_ADMIN") })
    );
    const isBranchUnchanged = checkData?.data?.branchId === "branch-bandung";

    const approveRes = await fetch(`${BASE_URL}/api/transfers/${transferId}/approve`, {
      method: "POST",
      headers: headersFor("SUPER_ADMIN"),
    });

    const finalData = await safeJson(
      await fetch(`${BASE_URL}/api/assets/${transferAssetId}`, { headers: headersFor("SUPER_ADMIN") })
    );
    const isBranchChanged = finalData?.data?.branchId === "branch-bogor";

    const passed = isBranchUnchanged && approveRes.status === 200 && isBranchChanged;
    recordResult(
      "MUT-01",
      "Transfer request creates PENDING transfer, approval updates branchId inside transaction",
      passed,
      passed
        ? "Before branch: branch-bandung, After branch: branch-bogor"
        : `Failed. Unchanged Check: ${isBranchUnchanged}, Approve status: ${approveRes.status}, Final branch: ${finalData?.data?.branchId || "Unknown"}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordResult("MUT-01", "Transfer request creates PENDING transfer, approval updates branchId inside transaction", false, message);
  } finally {
    // Kembalikan aset ke Bandung bila sempat berpindah, agar suite bisa diulang.
    const current = await safeJson(
      await fetch(`${BASE_URL}/api/assets/${transferAssetId}`, { headers: headersFor("SUPER_ADMIN") })
    );
    if (current?.data?.branchId === "branch-bogor") {
      const back = await safeJson(
        await fetch(`${BASE_URL}/api/assets/${transferAssetId}/transfer`, {
          method: "POST",
          headers: jsonHeaders("SUPER_ADMIN"),
          body: JSON.stringify({ toBranchId: "branch-bandung", reason: "QA cleanup MUT-01" }),
        })
      );
      if (back?.data?.id) {
        await fetch(`${BASE_URL}/api/transfers/${back.data.id}/approve`, {
          method: "POST",
          headers: headersFor("SUPER_ADMIN"),
        });
      }
    }
  }

  // TC-MUT-02 — penolakan transfer tidak memindahkan aset.
  // asset-pc-lenovo-bogor tidak dipakai tes lain dan tidak punya transfer PENDING.
  try {
    const assetId = "asset-pc-lenovo-bogor";
    const beforeBranch = (
      await safeJson(await fetch(`${BASE_URL}/api/assets/${assetId}`, { headers: headersFor("ADMIN_IT") }))
    )?.data?.branchId;

    const targetBranch = beforeBranch === "branch-bandung" ? "branch-bogor" : "branch-bandung";
    const reqRes = await fetch(`${BASE_URL}/api/assets/${assetId}/transfer`, {
      method: "POST",
      headers: jsonHeaders("STAFF_IT"),
      body: JSON.stringify({ toBranchId: targetBranch, reason: "TC-MUT-02 reject path" }),
    });
    const transferId = (await safeJson(reqRes))?.data?.id;
    if (!transferId) throw new Error(`No transfer ID returned for reject test (status ${reqRes.status}).`);

    const rejectRes = await fetch(`${BASE_URL}/api/transfers/${transferId}/reject`, {
      method: "POST",
      headers: headersFor("ADMIN_IT"),
    });
    const rejectData = await safeJson(rejectRes);

    const afterBranch = (
      await safeJson(await fetch(`${BASE_URL}/api/assets/${assetId}`, { headers: headersFor("ADMIN_IT") }))
    )?.data?.branchId;

    const passed =
      rejectRes.status === 200 &&
      rejectData?.data?.status === "REJECTED" &&
      afterBranch === beforeBranch;
    recordResult(
      "MUT-02",
      "Transfer rejection sets status REJECTED and leaves asset branch unchanged",
      passed,
      passed
        ? `Branch stayed at ${beforeBranch}, transfer marked REJECTED`
        : `Reject status: ${rejectRes.status}, transfer status: ${rejectData?.data?.status}, branch ${beforeBranch} → ${afterBranch}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordResult("MUT-02", "Transfer rejection sets status REJECTED and leaves asset branch unchanged", false, message);
  }

  // TC-TRF-01/02: mutasi antar outlet — terlihat kedua sisi, disetujui hanya asal
  try {
    // Aset Jakarta diajukan pindah ke Bogor oleh outlet ASAL (Jakarta).
    // Sengaja BUKAN `asset-router-mikrotik-jkt` — seed sudah memberinya satu
    // transfer PENDING, dan satu aset hanya boleh punya satu pengajuan aktif.
    const jakartaAssetId = "asset-laptop-asus-jkt";
    const reqRes = await fetch(`${BASE_URL}/api/assets/${jakartaAssetId}/transfer`, {
      method: "POST",
      headers: jsonHeaders("ADMIN_IT_JAKARTA"),
      body: JSON.stringify({ toBranchId: "branch-bogor", reason: "QA cross-outlet transfer" }),
    });
    const reqData = await safeJson(reqRes);
    const transferId = reqData?.data?.id;

    if (reqRes.status !== 201 || !transferId) {
      throw new Error(`Pengajuan gagal: ${reqRes.status} ${JSON.stringify(reqData)}`);
    }

    // Outlet TUJUAN (Bogor) harus dapat MELIHAT mutasi yang masuk ke outletnya.
    const listData = await safeJson(
      await fetch(`${BASE_URL}/api/transfers?limit=100`, { headers: headersFor("ADMIN_IT") })
    );
    const visibleToDestination = (listData?.data?.transfers ?? []).some(
      (t: { id: string }) => t.id === transferId
    );

    // ...namun TIDAK boleh menyetujuinya — kewenangan ada di outlet asal.
    const approveRes = await fetch(`${BASE_URL}/api/transfers/${transferId}/approve`, {
      method: "POST",
      headers: headersFor("ADMIN_IT"),
    });

    const passed = visibleToDestination && approveRes.status === 403;
    recordResult(
      "TRF-01",
      "Destination outlet can see an incoming transfer but cannot approve it",
      passed,
      passed
        ? "Terlihat oleh outlet tujuan, approve ditolak 403"
        : `Terlihat: ${visibleToDestination}, approve status: ${approveRes.status}`
    );

    // Bersihkan: outlet asal menolak pengajuannya sendiri agar aset tetap di Jakarta
    // dan tidak ada transfer PENDING yang menggantung untuk run berikutnya.
    const rejectRes = await fetch(`${BASE_URL}/api/transfers/${transferId}/reject`, {
      method: "POST",
      headers: jsonHeaders("ADMIN_IT_JAKARTA"),
      body: JSON.stringify({ notes: "QA cleanup" }),
    });

    recordResult(
      "TRF-02",
      "Origin outlet can reject its own transfer request",
      rejectRes.status === 200,
      rejectRes.status === 200 ? "Reject 200 oleh outlet asal" : `Status: ${rejectRes.status}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordResult("TRF-01", "Destination outlet can see an incoming transfer but cannot approve it", false, message);
  }

  await runTest("TRF-05", "Admin pemegang outlet asal & tujuan dapat menyetujui mutasinya", async () => {
    const move = async (from: string, to: string) => {
      const req = await safeJson(
        await fetch(`${BASE_URL}/api/assets/asset-ac-bogor/transfer`, {
          method: "POST",
          headers: jsonHeaders("ADMIN_ENGINEERING"),
          body: JSON.stringify({ toBranchId: to, reason: `QA ${from} → ${to}` }),
        })
      );
      const approve = await fetch(`${BASE_URL}/api/transfers/${req?.data?.id}/approve`, { method: "POST", headers: headersFor("ADMIN_ENGINEERING") });
      return approve.status;
    };
    const approved = await move("branch-bogor", "branch-jakarta");
    const moved = await safeJson(await fetch(`${BASE_URL}/api/assets/asset-ac-bogor`, { headers: headersFor("ADMIN_ENGINEERING") }));
    const restored = await move("branch-jakarta", "branch-bogor"); // kembalikan untuk run berikutnya
    const passed = approved === 200 && moved?.data?.branchId === "branch-jakarta" && restored === 200;
    return { passed, notes: `approve=${approved} branch=${moved?.data?.branchId} restore=${restored}` };
  });

  await runTest("ORG-04", "Tujuan transfer milik organisasi lain ditolak 400", async () => {
    const res = await fetch(`${BASE_URL}/api/assets/asset-laptop-dell-bogor/transfer`, {
      method: "POST",
      headers: jsonHeaders("ADMIN_IT"),
      body: JSON.stringify({ toBranchId: "branch-b1", reason: "QA lintas organisasi" }),
    });
    return { passed: res.status === 400, notes: `status=${res.status}` };
  });

  await runTest("ORG-05a", "Persetujuan transfer organisasi lain: 404 dan data tidak berubah", async () => {
    const approve = await fetch(`${BASE_URL}/api/transfers/transfer-b-001/approve`, { method: "POST", headers: headersFor("SUPER_ADMIN") });
    const reject = await fetch(`${BASE_URL}/api/transfers/transfer-b-001/reject`, { method: "POST", headers: headersFor("SUPER_ADMIN") });
    const list = await safeJson(await fetch(`${BASE_URL}/api/transfers?status=PENDING`, { headers: headersFor("B_SUPER_ADMIN") }));
    const stillPending = (list?.data?.transfers ?? []).some((t: { id: string }) => t.id === "transfer-b-001");
    const passed = approve.status === 404 && reject.status === 404 && stillPending;
    return { passed, notes: `approve=${approve.status} reject=${reject.status} masih PENDING=${stillPending}` };
  });
}
