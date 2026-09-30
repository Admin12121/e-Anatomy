import type { ReactNode } from "react";
import { hasCapability } from "@/lib/auth/access";
import { loadContentContext } from "@/lib/content/server";
import { ContentWorkspace } from "./_components/content-workspace";

export default async function ContentLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { user, workspace } = await loadContentContext(slug);
  return (
    <ContentWorkspace
      workspace={workspace}
      canViewAnalytics={hasCapability(user.roleCode, "view_analytics")}
    >
      {children}
    </ContentWorkspace>
  );
}
