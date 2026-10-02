"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useState } from "react";
import {
  ActivityIcon,
  BookOpenIcon,
  BrainIcon,
  ChartNoAxesCombinedIcon,
  FileTextIcon,
  GlobeIcon,
  SearchIcon,
  UsersIcon,
} from "lucide-react";
import { NestedSidebar } from "@/components/content/nested-sidebar";
import { preloadProjectRichText } from "@/components/anatomy/project-rich-text";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import type { ContentWorkspace as Workspace } from "@/lib/content/types";
import { isResourceEditor } from "@/lib/content/resources";

const reports = [
  { section: "overview", label: "Overview", icon: ChartNoAxesCombinedIcon },
  { section: "audience", label: "Audience", icon: UsersIcon },
  { section: "acquisition", label: "Acquisition", icon: GlobeIcon },
  { section: "engagement", label: "Engagement", icon: ActivityIcon },
  { section: "resources", label: "Resources", icon: BookOpenIcon },
];

function WorkspaceItems({
  open,
  editor,
  workspace,
  base,
  canViewAnalytics,
}: {
  open: boolean;
  editor: boolean;
  workspace: Workspace;
  base: string;
  canViewAnalytics: boolean;
}) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const selectedLabel = workspace.labels.find(
    (label) => pathname === `${base}/resources/labels/${label.id}`,
  );
  const modalityId =
    selectedLabel?.modalityId ?? workspace.family.primaryModalityId;
  const labels = workspace.labels.filter(
    (label) =>
      label.modalityId === modalityId &&
      [label.title, label.groupName, label.modalityName].some((value) =>
        value?.toLowerCase().includes(query),
      ),
  );
  const onNavigate = () => setOpenMobile(false);
  function articleLink(href: string, title: string, icon: ReactNode) {
    return (
      <SidebarMenuItem key={href}>
        <SidebarMenuButton
          asChild
          isActive={pathname === href}
          tooltip={title}
          className={!open ? "justify-center" : undefined}
        >
          <Link
            href={href}
            onClick={onNavigate}
            onPointerEnter={editor ? preloadProjectRichText : undefined}
            onFocus={editor ? preloadProjectRichText : undefined}
            aria-current={pathname === href ? "page" : undefined}
          >
            {icon}
            {open ? (
              <span className="truncate">{title}</span>
            ) : (
              <span className="sr-only">{title}</span>
            )}
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }
  if (!editor)
    return (
      <SidebarGroup className="p-2">
        <SidebarGroupContent>
          <SidebarMenu aria-label="Content reports">
            {reports
              .filter(
                (report) => canViewAnalytics || report.section === "resources",
              )
              .map(({ section, label, icon: Icon }) =>
                articleLink(`${base}/${section}`, label, <Icon />),
              )}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  return (
    <SidebarGroup className="gap-3 p-2">
      {open ? (
        <InputGroup>
          <InputGroupInput
            type="search"
            placeholder="Search articles…"
            aria-label="Search articles"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
        </InputGroup>
      ) : null}
      <SidebarGroupContent>
        <SidebarMenu aria-label="Anatomy articles">
          {articleLink(
            `${base}/resources/modality`,
            workspace.family.name,
            workspace.family.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={workspace.family.thumbnailUrl}
                alt=""
                className="size-4 shrink-0 rounded object-cover"
              />
            ) : (
              <BrainIcon />
            ),
          )}
          {labels.map((label) =>
            articleLink(
              `${base}/resources/labels/${label.id}`,
              label.title,
              label.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={label.thumbnailUrl}
                  alt=""
                  className="size-4 shrink-0 rounded object-cover"
                />
              ) : (
                <FileTextIcon />
              ),
            ),
          )}
        </SidebarMenu>
        {open && !labels.length ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            No matching labels.
          </p>
        ) : null}
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function ContentWorkspace({
  children,
  workspace,
  canViewAnalytics,
}: {
  children: ReactNode;
  workspace: Workspace;
  canViewAnalytics: boolean;
}) {
  const pathname = usePathname();
  const base = `/content/${workspace.family.slug}`;
  const editor = isResourceEditor(pathname, base);
  return (
    <NestedSidebar
      editor={editor}
      backHref={editor ? `${base}/resources` : "/content"}
      backLabel={editor ? "Back to resources" : "Back to content"}
      items={(open) => (
        <WorkspaceItems
          open={open}
          editor={editor}
          workspace={workspace}
          base={base}
          canViewAnalytics={canViewAnalytics}
        />
      )}
    >
      {children}
    </NestedSidebar>
  );
}
