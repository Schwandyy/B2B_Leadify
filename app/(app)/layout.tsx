import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { Sidebar } from "@/components/app/sidebar";
import { Topbar } from "@/components/app/topbar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <Sidebar orgName={user.organization.name} isAdmin={user.role === "ADMIN"} />
      <div className="flex min-h-screen flex-1 flex-col">
        <Topbar userName={user.name ?? user.email} userEmail={user.email} />
        <main className="flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
