export type AppMode = "self-hosted" | "saas";

/**
 * Mode instalasi (env `APP_MODE`). Nilai selain "saas" diperlakukan
 * self-hosted: satu organisasi, login tanpa kode organisasi.
 */
export function getAppMode(): AppMode {
  return process.env.APP_MODE === "saas" ? "saas" : "self-hosted";
}
