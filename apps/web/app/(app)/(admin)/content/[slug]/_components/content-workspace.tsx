"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useState } from "react";
import {
  ActivityIcon,
  BookOpenIcon,
  BrainIcon,
  ChartNoAxesCombinedIcon,
  ChevronRightIcon,
  FileTextIcon,
  FolderIcon,
  GlobeIcon,
  SearchIcon,
  UsersIcon,
} from "lucide-react";
import { NestedSidebar } from "@/components/content/nested-sidebar";
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
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
            aria-label="Search article tree"
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
          {open ? (
            <SidebarMenuItem>
              <details open className="group/zone">
                <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-2 text-sm font-medium hover:bg-sidebar-accent">
                  <ChevronRightIcon className="size-3.5 shrink-0 group-open/zone:rotate-90" />
                  <FolderIcon className="size-4 shrink-0" />
                  <span className="truncate">{workspace.family.zoneName}</span>
                </summary>
                <SidebarMenuSub className="mr-0 pr-0">
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton
                      asChild
                      isActive={pathname === `${base}/resources/modality`}
                    >
                      <Link
                        href={`${base}/resources/modality`}
                        onClick={onNavigate}
                        aria-current={
                          pathname === `${base}/resources/modality`
                            ? "page"
                            : undefined
                        }
                      >
                        <BrainIcon />
                        <span>{workspace.family.name}</span>
                      </Link>
                    </SidebarMenuSubButton>
                    <SidebarMenuSub className="mr-0 pr-0">
                      {labels.map((label) => (
                        <SidebarMenuSubItem key={label.id}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={
                              pathname ===
                              `${base}/resources/labels/${label.id}`
                            }
                          >
                            <Link
                              href={`${base}/resources/labels/${label.id}`}
                              onClick={onNavigate}
                              title={`${label.title} · ${label.modalityName}`}
                              aria-current={
                                pathname ===
                                `${base}/resources/labels/${label.id}`
                                  ? "page"
                                  : undefined
                              }
                            >
                              <FileTextIcon />
                              <span>{label.title}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </SidebarMenuSubItem>
                </SidebarMenuSub>
              </details>
            </SidebarMenuItem>
          ) : (
            <>
              {articleLink(
                `${base}/resources/modality`,
                workspace.family.name,
                <BrainIcon />,
              )}
              {labels.map((label) =>
                articleLink(
                  `${base}/resources/labels/${label.id}`,
                  label.title,
                  <FileTextIcon />,
                ),
              )}
            </>
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
