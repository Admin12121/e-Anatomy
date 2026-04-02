import { getAdminViewer } from "@/lib/auth/session";

export default async function DashboardPage() {
  const viewer = await getAdminViewer();

  return <>Dashboard</>;
}
