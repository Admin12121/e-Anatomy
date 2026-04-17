import type { CSSProperties, ReactNode } from "react";

import { requireAdminSession } from "@/lib/auth/session";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { SiteHeader } from "@/components/dashboard/site-header";

type AdminLayoutProps = {
  children: ReactNode;
};

export default async function AdminLayout({ children }: AdminLayoutProps) {
  const { user } = await requireAdminSession();

  return (
    <SidebarProvider
      className="flex h-dvh min-h-0 overflow-hidden"
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 64)",
          "--header-height": "calc(var(--spacing) * 12 + 1px)",
        } as CSSProperties
      }
    >
      <AppSidebar
        variant="sidebar"
        user={{
          name: user.name,
          email: user.email,
          avatar: user.image,
        }}
      />
      <SidebarInset className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden">
        <SiteHeader />
        <div
          data-lenis-prevent
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-y-contain dark:bg-[#171717]"
        >
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
