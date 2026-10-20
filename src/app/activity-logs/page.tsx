import { getPageContext } from "@/lib/auth";
import AccessDenied from "@/components/AccessDenied";
import ActivityLogsClient from "./ActivityLogsClient";

export const dynamic = "force-dynamic";

export default async function ActivityLogsPage() {
  const ctx = await getPageContext();
  if (!ctx || ctx.user.role !== "SUPER_ADMIN") {
    return <AccessDenied message="Halaman ini hanya dapat diakses oleh Super Admin." />;
  }
  return <ActivityLogsClient />;
}
