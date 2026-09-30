"use client";

import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { ArrowLeftIcon, PanelLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function ContentSidebarToggle() {
  const { open, openMobile, isMobile, toggleSidebar } = useSidebar();
  const label = isMobile
    ? openMobile
      ? "Close navigation"
      : "Open navigation"
    : open
      ? "Collapse navigation"
      : "Expand navigation";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          aria-label={label}
          size="icon-sm"
          variant="ghost"
          onClick={toggleSidebar}
        >
          <PanelLeftIcon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

type NestedSidebarProps = {
  children: ReactNode;
  items: (open: boolean) => ReactNode;
  backHref: string;
  backLabel: string;
  editor: boolean;
};

function NestedSidebarBody({
  children,
  items,
  backHref,
  backLabel,
  editor,
}: NestedSidebarProps) {
  const { open, isMobile } = useSidebar();
  const expanded = open && !isMobile;
  function railContent(showLabels: boolean) {
    return (
      <>
        <SidebarHeader className="h-12 shrink-0 flex-row items-center justify-between border-b px-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                asChild
                size="icon-sm"
                variant="ghost"
                aria-label={backLabel}
              >
                <Link href={backHref}>
                  <ArrowLeftIcon />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{backLabel}</TooltipContent>
          </Tooltip>
          {showLabels ? <ContentSidebarToggle /> : null}
        </SidebarHeader>
        <SidebarContent
          className="gap-0 overscroll-contain group-data-[collapsible=icon]:overflow-y-auto"
          data-lenis-prevent
        >
          {items(showLabels)}
        </SidebarContent>
        {!showLabels ? (
          <div className="border-t p-2">
            <ContentSidebarToggle />
          </div>
        ) : null}
      </>
    );
  }
  return (
    <>
      <Sidebar
        collapsible="none"
        className="group min-h-0 min-w-0 shrink-0 overflow-hidden border-r"
        data-state={expanded ? "expanded" : "collapsed"}
        data-collapsible={expanded ? "" : "icon"}
        style={{ width: expanded ? "16rem" : "3.25rem" }}
      >
        {railContent(expanded)}
      </Sidebar>
      {isMobile ? (
        <Sidebar collapsible="offcanvas">{railContent(true)}</Sidebar>
      ) : null}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div
          className={
            editor
              ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
              : "min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-4 lg:p-5"
          }
          data-lenis-prevent
        >
          {children}
        </div>
      </div>
    </>
  );
}

/** In-flow rail: it never installs a second fixed desktop sidebar. */
export function NestedSidebar(props: NestedSidebarProps) {
  const main = useSidebar();
  const handled = useRef(false);
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (
      main.isMobile ||
      !window.matchMedia("(min-width: 768px)").matches ||
      handled.current
    )
      return;
    handled.current = true;
    if (main.open) main.setOpen(false);
  }, [main.isMobile, main.open, main.setOpen]);
  return (
    <SidebarProvider
      open={open}
      onOpenChange={setOpen}
      keyboardShortcut={false}
      persistOpen={false}
      className="h-full min-h-0 min-w-0 flex-1 overflow-hidden"
      style={
        {
          "--sidebar-width": "16rem",
          "--sidebar-width-icon": "3.25rem",
        } as CSSProperties
      }
    >
      <NestedSidebarBody {...props} />
    </SidebarProvider>
  );
}
