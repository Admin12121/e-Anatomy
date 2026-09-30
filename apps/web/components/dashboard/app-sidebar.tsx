"use client";

import * as React from "react";
import {
  BarChart3Icon,
  FileStackIcon,
  FolderIcon,
  LayoutDashboardIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { NavUser } from "./nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { IconHelp, IconSearch, IconSettings } from "@tabler/icons-react";
import { NavSecondary } from "./nav-secondary";
import Image from "next/image";
import {
  hasCapability,
  type RoleCode,
} from "@/lib/auth/access";

type SidebarUser = {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  roleCode: RoleCode;
};

function normalizePathname(pathname: string | null) {
  if (!pathname) return "/dashboard";
  if (pathname === "/") return "/dashboard";
  return pathname.length > 1 && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;
}

function getPrimaryNav(roleCode: RoleCode) {
  const items = [];

  if (hasCapability(roleCode, "view_analytics")) {
    items.push(
      { title: "Dashboard", href: "/dashboard", icon: <LayoutDashboardIcon /> },
      { title: "Users", href: "/users", icon: <UsersIcon /> },
    );
  }

  if (hasCapability(roleCode, "manage_content")) {
    items.push(
      { title: "Content", href: "/content", icon: <FileStackIcon /> },
      { title: "Playground", href: "/playground", icon: <FolderIcon /> },
    );
  }

  if (hasCapability(roleCode, "view_analytics")) {
    items.push({
      title: "Analytics",
      href: "/analytics",
      icon: <BarChart3Icon />,
    });
  }

  return items;
}

const navSecondary = [
  {
    title: "Settings",
    url: "/settings",
    icon: IconSettings,
  },
  {
    title: "Get Help",
    url: "#",
    icon: IconHelp,
  },
  {
    title: "Search",
    url: "#",
    icon: IconSearch,
  },
];

export function AppSidebar({
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: SidebarUser;
}) {
  const pathname = usePathname();
  const currentPath = React.useMemo(
    () => normalizePathname(pathname),
    [pathname],
  );
  const navItems = getPrimaryNav(user.roleCode);

  const isActive = (url: string) => {
    if (url === "/dashboard" || url === "/bookings") {
      return currentPath === url;
    }
    return currentPath === url || currentPath.startsWith(`${url}/`);
  };

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader className="border-b">
        <SidebarMenu>
          <SidebarMenuItem className="flex flex-row gap-2">
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:!p-1.5"
            >
              <Link href={"#"}>
                <div className="flex size-14 items-center justify-center rounded-md">
                  <Image
                    src="/logo.webp"
                    alt="Anatomy"
                    height={35}
                    width={35}
                    className="rounded-md dark:rounded-none"
                  />
                </div>
                <span className="text-base font-semibold">Voxel Anatomy</span>
              </Link>
            </SidebarMenuButton>
            <SidebarTrigger className="-ml-1 flex sm:hidden" />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.href)}
                    tooltip={item.title}
                  >
                    <Link href={item.href}>
                      {item.icon}
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <NavSecondary items={navSecondary} className="mt-auto" />
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
