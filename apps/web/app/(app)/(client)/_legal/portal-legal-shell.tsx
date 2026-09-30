"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode, type WheelEvent } from "react";

import { cn } from "@/lib/utils";

type LegalKind = "about" | "terms" | "privacy";

type PortalLegalShellProps = {
  kind: LegalKind;
  title: string;
  html: string;
  updated?: string | null;
};

const TermsIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 2h12v2H8zM6 4h2v16H6zm14 0h2v16h-2zM4 20h16v2H4zm-2-9h2v9H2zm2-2h2v2H4zm6-3h8v2h-8zm0 4h8v2h-8zm0-2h2v2h-2zm6 0h2v2h-2zm-6 5h8v2h-8zm0 3h4v2h-4z" />
  </svg>
);

const PrivacyIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
    <path d="M4 2h16v2H4zM2 4h2v10H2zm18 0h2v10h-2zM4 14h2v2H4zm2 2h2v2H6zm4 4h4v2h-4zm10-6h-2v2h2zm-2 2h-2v2h2zm-2 2h-2v2h2zm-6 0H8v2h2z" />
  </svg>
);


const AboutIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
    <path d="M10 2h4v2h-4zM8 4h8v2H8zM6 6h12v12H6zM8 8v8h8V8zm3 1h2v2h-2zm0 4h2v3h-2zM8 18h8v2H8zM10 20h4v2h-4z" />
  </svg>
);

const CollapseIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
    <path d="M4 4v16H2V4zm18 7v2H6v-2zm-12 2v2H8v-2zm2 2v2h-2v-2zm2 2v2h-2v-2zm-4-8v2H8V9zm2-2v2h-2V7zm2-2v2h-2V5z" />
  </svg>
);

const CreateAccountIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
    <path d="M9 2h6v2H9zm0 8h6v2H9zm6-6h2v6h-2zM7 4h2v6H7zM4 18h2v4H4zm14 0h2v4h-2zM8 14h8v2H8zm-2 2h2v2H6zm10 0h2v2h-2z" />
  </svg>
);

const LoginIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
    <path d="M4 20h16v2H4zM4 2h16v2H4zM2 4h2v16H2zm18 0h2v16h-2zM9 15h6v2H9zM7 9h2v6H7zm8 0h2v6h-2zm-4-2h2v5h-2z" />
  </svg>
);

const BackIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
    <path d="M9 5h2v2H9zm-2 2h2v2H7zM5 9h2v2H5zm-2 2h2v2H3zm2 2h2v2H5zm2 2h2v2H7zm2 2h2v2H9zm2-6h10v2H11z" />
  </svg>
);

const MenuIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
    <path
      d="M3.333 5.833h13.334M3.333 10h13.334M3.333 14.167h13.334"
      stroke="currentColor"
      strokeLinecap="square"
      strokeWidth="1.667"
    />
  </svg>
);

const CloseIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
    <path
      d="M5 5l10 10M15 5 5 15"
      stroke="currentColor"
      strokeLinecap="square"
      strokeWidth="1.667"
    />
  </svg>
);

function LegalNavItem({
  href,
  label,
  active,
  icon,
  collapsed,
}: {
  href: string;
  label: string;
  active: boolean;
  icon: ReactNode;
  collapsed: boolean;
}) {
  const content = (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-y-0 left-3 right-3 -z-10 rounded-r-md bg-[#f2f2f2]/20 opacity-0 transition-opacity duration-150",
          active
            ? "group-hover:opacity-0 group-focus-visible:opacity-0"
            : "group-hover:opacity-100 group-focus-visible:opacity-100",
        )}
      />
      {active ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-px -translate-y-1/2 bg-current"
        />
      ) : null}
      <span aria-hidden="true" className="inline-flex size-4 shrink-0 items-center justify-center [&_svg]:size-full">
        {icon}
      </span>
      <span
        className={cn(
          "shrink-0 font-['Rules_Variable','Arial_Narrow',sans-serif] text-sm font-medium leading-none [font-variation-settings:'wdth'_50] uppercase",
          collapsed && "hidden",
        )}
      >
        {label}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "min-w-0 flex-1 self-center border-b border-dotted border-[#f2f2f2]/20 transition-colors duration-150 group-hover:border-[#f2f2f2]/60 group-focus-visible:border-[#f2f2f2]/60",
          collapsed && "hidden",
        )}
      />
    </>
  );

  const className = cn(
    "group relative isolate -mx-5 flex min-h-[30px] items-center gap-4 px-5 py-1 text-left text-inherit no-underline outline-none",
    collapsed && "justify-center",
    active ? "cursor-default" : "cursor-pointer",
  );

  if (active) {
    return (
      <span aria-current="page" className={className}>
        {content}
      </span>
    );
  }

  return (
    <Link className={className} href={href} scroll>
      {content}
    </Link>
  );
}

function PageHeader({ title, scrolled }: { title: string; scrolled: boolean }) {
  const router = useRouter();

  const goBack = () => {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push("/");
  };

  return (
    <header
      className={cn(
        "relative z-20 flex h-[50px] w-full shrink-0 flex-col justify-center bg-[#f2f2f2] px-[var(--inner-offset)] py-2.5 text-[#0000f2] dark:bg-[#000030] dark:text-[#f2f2f2] max-[500px]:px-[max(16px,var(--inner-offset))]",
        "after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-px after:bg-[#0000f2]/10 after:transition-opacity after:duration-100 dark:after:bg-[#f2f2f2]/10",
        scrolled ? "after:opacity-100" : "after:opacity-0",
      )}
    >
      <div className="flex h-full w-full items-center justify-between">
        <h1 className="m-0 flex min-w-0 items-center gap-2.5 font-['Rules_Variable','Arial_Narrow',sans-serif] text-sm font-medium leading-[1.4] text-[#000061] [font-variation-settings:'wdth'_50] uppercase dark:text-[#f2f2f2]">
          <span className="shrink-0 opacity-30">//</span>
          <span>{title}</span>
        </h1>

        <button
          aria-label="Back"
          className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent p-0 text-[#000061] opacity-[0.55] transition-[opacity,background-color] duration-150 hover:bg-[#0000f2]/[0.08] hover:opacity-100 focus-visible:bg-[#0000f2]/[0.08] focus-visible:opacity-100 dark:text-[#f2f2f2] dark:hover:bg-[#f2f2f2]/[0.08] dark:focus-visible:bg-[#f2f2f2]/[0.08] [&_svg]:size-4"
          onClick={goBack}
          title="Back"
          type="button"
        >
          <BackIcon />
        </button>
      </div>
    </header>
  );
}

export function PortalLegalShell({ kind, title, html, updated }: PortalLegalShellProps) {
  const router = useRouter();
  const mainRef = useRef<HTMLDivElement | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [contentScrolled, setContentScrolled] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    // Legal pages own their scroll position inside `mainRef`. Never move the
    // document itself here: doing so fights the home/legal transition lock and
    // can leave the persistent route wrapper in a stale state.
    const frame = window.requestAnimationFrame(() => {
      mainRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
      setContentScrolled(false);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [kind]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [kind]);

  useEffect(() => {
    if (!mobileNavOpen) return;

    const root = document.documentElement;
    const previous = root.style.overflowY;
    root.style.overflowY = "hidden";

    return () => {
      root.style.overflowY = previous;
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem("legal-sidebar-collapsed") === "1");
    } catch {
      // Local storage is optional; keep the expanded default when unavailable.
    }
  }, []);

  const handleSidebarWheel = (event: WheelEvent<HTMLElement>) => {
    const main = mainRef.current;
    if (!main || event.deltaY === 0) return;

    // The sidebar is intentionally fixed. Forward wheel input from it to the
    // legal content so the page still feels scrollable no matter where the
    // pointer is, while only the right-hand content actually moves.
    main.scrollBy({ top: event.deltaY, left: 0, behavior: "auto" });
  };

  const toggleSidebar = () => {
    setCollapsed((value) => {
      const next = !value;
      try {
        window.localStorage.setItem("legal-sidebar-collapsed", next ? "1" : "0");
      } catch {
        // Ignore storage failures; the in-memory state still works.
      }
      return next;
    });
  };

  const goBack = () => {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push("/");
  };

  return (
    <div
      className={cn(
        "relative h-dvh min-h-0 w-full overflow-hidden bg-[#0000c2] text-[#f2f2f2] font-['Rules_Variable',Arial,sans-serif] [font-synthesis:none] antialiased uppercase",
        "[--u:max(calc(100vw/2360),0.58px)] [--inner-offset:calc(33*var(--u))] [--space-24:calc(24*max(var(--u),1px))] [--space-64:calc(64*max(var(--u),1px))]",
        "max-lg:[--inner-offset:calc(24*var(--u))] max-[500px]:[--u:min(calc(100vw/500),0.696px)]",
        "dark:bg-[#000061]",
      )}
    >
      <div className="relative h-dvh min-h-0 w-full overflow-hidden bg-[#0000c2] dark:bg-[#000061]">
        <a
          className="absolute -left-[9999px] top-auto z-[999] focus:left-3 focus:top-3 focus:bg-[#f2f2f2] focus:px-3 focus:py-2 focus:text-[#0000f2] dark:focus:bg-[#000030] dark:focus:text-[#f2f2f2]"
          href="#legal-main"
        >
          Skip to main content
        </a>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 bg-[length:calc(204.8*var(--u))_calc(204.8*var(--u))] bg-repeat opacity-10 mix-blend-color-burn dark:opacity-5 dark:mix-blend-screen"
          style={{ backgroundImage: 'url("/legal-portal/noise.png")' }}
        />

        <div className="relative z-[1] flex h-dvh min-h-0 w-full flex-col items-center gap-[5px] overflow-hidden p-[5px]">
          <div
            className={cn(
              "flex h-[calc(100dvh-10px)] min-h-0 w-full flex-1 items-start overflow-hidden bg-[#f2f2f2] transition-[padding-left] duration-200 ease-out dark:bg-[#000030]",
              collapsed ? "lg:pl-[72px]" : "lg:pl-[320px]",
            )}
          >
            <aside
              aria-label="Legal navigation"
              onWheel={handleSidebarWheel}
              className={cn(
                "group/sidebar fixed bottom-[5px] left-[5px] top-[5px] z-[100] hidden flex-col overflow-hidden bg-[#000061] text-[#f2f2f2] transition-[width] duration-200 ease-out dark:bg-[#000030] lg:flex",
                collapsed ? "w-[72px]" : "w-[320px]",
              )}
            >
              <div className="relative isolate z-[1] flex h-full min-h-0 w-full flex-col overflow-hidden">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 -z-10 select-none bg-[length:978px] bg-no-repeat opacity-20 mix-blend-plus-lighter dark:opacity-15"
                  style={{
                    backgroundImage: 'url("/legal-portal/sidebar-art.png")',
                    backgroundPosition: "-163px -107px",
                  }}
                />

                <div className={cn("relative z-[1] flex shrink-0 flex-col gap-4 p-5", collapsed && "items-center")}>
                  <Link
                    aria-label="Home"
                    className={cn(
                      "flex w-fit max-w-full items-start gap-3 text-inherit no-underline",
                      collapsed && "order-1 gap-0",
                    )}
                    href="/"
                  >
                    <img
                      alt=""
                      aria-hidden="true"
                      className={cn(
                        "shrink-0 object-contain",
                        collapsed ? "h-[45.714px] w-8" : "h-[85.714px] w-[60px]",
                      )}
                      src="/logo.webp"
                    />
                    <span
                      className={cn(
                        "min-w-0 flex-1 flex-col pt-px font-['Rules_Gothic_Compressed','Arial_Narrow',sans-serif] text-[36px] font-medium leading-[0.9] tracking-normal uppercase [&>span]:block",
                        collapsed ? "hidden" : "flex",
                      )}
                    >
                      <span>Voxel</span>
                      <span>Anatomy</span>
                    </span>
                  </Link>

                  <button
                    aria-expanded={!collapsed}
                    aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
                    className={cn(
                      "z-[3] flex cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-inherit opacity-50 transition-[opacity,transform] duration-150 hover:opacity-100 focus-visible:opacity-100 group-hover/sidebar:opacity-100 [&_svg]:size-4",
                      collapsed
                        ? "static order-0 mx-auto size-4 rotate-180"
                        : "absolute right-[9px] top-0 h-[50px] w-8",
                    )}
                    onClick={toggleSidebar}
                    title={collapsed ? "Expand navigation" : "Collapse navigation"}
                    type="button"
                  >
                    <CollapseIcon />
                  </button>

                  <Link
                    className={cn(
                      "flex h-8 shrink-0 items-center gap-2 rounded-sm bg-[#f2f2f2] text-[#000061] no-underline outline-none transition-opacity duration-150 hover:opacity-80 focus-visible:opacity-80 active:opacity-80",
                      collapsed ? "order-2 w-8 justify-center px-0" : "w-full px-3",
                    )}
                    href="/login"
                  >
                    <span
                      className={cn(
                        "min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-['Rules_Variable','Arial_Narrow',sans-serif] text-sm font-medium leading-[1.4] [font-variation-settings:'wdth'_50] uppercase",
                        collapsed && "hidden",
                      )}
                    >
                      Create Voxel Account
                    </span>
                    <span aria-hidden="true" className="inline-flex size-4 shrink-0 items-center justify-center [&_svg]:size-full">
                      <CreateAccountIcon />
                    </span>
                  </Link>
                </div>

                <nav
                  aria-label="Legal pages"
                  data-lenis-prevent=""
                  className="flex min-h-0 flex-1 flex-col gap-[7px] overflow-x-hidden overflow-y-auto overscroll-contain px-5 pb-5 pt-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  <LegalNavItem
                    active={kind === "terms"}
                    collapsed={collapsed}
                    href="/terms"
                    icon={<TermsIcon />}
                    label="Terms"
                  />
                  <LegalNavItem
                    active={kind === "privacy"}
                    collapsed={collapsed}
                    href="/privacy"
                    icon={<PrivacyIcon />}
                    label="Privacy"
                  />
                  <LegalNavItem
                    active={kind === "about"}
                    collapsed={collapsed}
                    href="/about"
                    icon={<AboutIcon />}
                    label="About Us"
                  />
                </nav>

                <div className="shrink-0 p-5">
                  <Link
                    className={cn(
                      "group/signin flex min-w-0 items-center gap-2 text-inherit no-underline outline-none",
                      collapsed && "justify-center",
                    )}
                    href="/login"
                  >
                    <span
                      aria-hidden="true"
                      className="inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-[#f2f2f2]/[0.08] transition-colors duration-150 group-hover/signin:bg-[#f2f2f2]/20 group-focus-visible/signin:bg-[#f2f2f2]/20 [&_svg]:size-4"
                    >
                      <LoginIcon />
                    </span>
                    <span
                      className={cn(
                        "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-['Rules_Variable','Arial_Narrow',sans-serif] text-sm font-medium leading-[1.3] [font-variation-settings:'wdth'_50] uppercase",
                        collapsed && "hidden",
                      )}
                    >
                      Member Sign in
                    </span>
                  </Link>
                </div>
              </div>
            </aside>

            <main
              className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden text-[#616191] outline-none dark:text-[#f2f2f2]/80"
            >
              <PageHeader scrolled={contentScrolled} title={title} />

              <div
                className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-[var(--inner-offset)] pb-[calc(var(--inner-offset)+calc(76*var(--u)))] pt-[var(--space-24)] [scrollbar-gutter:stable] max-[500px]:px-[max(16px,var(--inner-offset))] lg:pb-[calc(var(--inner-offset)+24px)]"
                data-lenis-prevent=""
                id="legal-main"
                onScroll={(event) => setContentScrolled(event.currentTarget.scrollTop > 1)}
                ref={mainRef}
                tabIndex={-1}
              >
                <div className="flex min-w-0 flex-col gap-[var(--space-64)]">
                  <article
                    className={cn(
                      "mx-auto w-full max-w-[calc(1024*var(--u))] font-['Rules_Variable',Arial,sans-serif] text-base font-normal leading-[1.6] normal-case text-[#616191] dark:text-[#f2f2f2]/80 max-[500px]:text-[15px]",
                      "[&_section]:mb-[2em] [&_p]:m-0 [&_p]:mb-[1em]",
                      "[&_h1]:font-['Rules_Variable',Arial,sans-serif] [&_h1]:normal-case [&_h1]:text-[#0000f2] dark:[&_h1]:text-[#f2f2f2]",
                      "[&_h2]:mb-[1em] [&_h2]:mt-[2em] [&_h2]:border-b [&_h2]:border-[#0000f2]/20 [&_h2]:pb-[0.5em] [&_h2]:font-['Rules_Variable',Arial,sans-serif] [&_h2]:text-[1.35em] [&_h2]:font-bold [&_h2]:normal-case [&_h2]:text-[#0000f2] dark:[&_h2]:border-[#f2f2f2]/20 dark:[&_h2]:text-[#f2f2f2]",
                      "[&_h3]:mb-[0.75em] [&_h3]:mt-[1.5em] [&_h3]:font-['Rules_Variable',Arial,sans-serif] [&_h3]:text-[1.15em] [&_h3]:font-semibold [&_h3]:normal-case [&_h3]:text-[#0000f2] dark:[&_h3]:text-[#f2f2f2]",
                      "[&_ol]:mb-[1em] [&_ol]:ml-[2em] [&_ol]:list-decimal [&_ol]:p-0 [&_ul]:mb-[1em] [&_ul]:ml-[2em] [&_ul]:list-disc [&_ul]:p-0 [&_li]:mb-[0.5em]",
                      "[&_ol_ol]:mb-0 [&_ol_ol]:mt-[0.5em] [&_ol_ul]:mb-0 [&_ol_ul]:mt-[0.5em] [&_ul_ol]:mb-0 [&_ul_ol]:mt-[0.5em] [&_ul_ul]:mb-0 [&_ul_ul]:mt-[0.5em]",
                      "[&_dl]:mb-[1em] [&_dt]:mt-[1em] [&_dt]:font-bold [&_dt]:text-[#0000f2] dark:[&_dt]:text-[#f2f2f2] [&_dd]:mb-[0.5em] [&_dd]:ml-[1em]",
                      "md:[&_dl]:grid md:[&_dl]:grid-cols-[1fr_3fr] md:[&_dl]:gap-x-[1em] md:[&_dl]:gap-y-[0.5em] md:[&_dt]:col-start-1 md:[&_dt]:mt-0 md:[&_dt]:text-right md:[&_dd]:col-start-2 md:[&_dd]:ml-0 md:[&_dd]:mt-0",
                      "[&_a]:text-[#0000f2] [&_a]:underline [&_a]:decoration-[#0000f2]/50 [&_a]:underline-offset-2 [&_a:hover]:decoration-[#0000f2] dark:[&_a]:text-[#f2f2f2] dark:[&_a]:decoration-[#f2f2f2]/50 dark:[&_a:hover]:decoration-[#f2f2f2]",
                    )}
                  >
                    {updated ? (
                      <div className="mb-6 flex justify-end text-[smaller] text-[#616191] dark:text-[#f2f2f2]/80">
                        {updated}
                      </div>
                    ) : null}
                    <div dangerouslySetInnerHTML={{ __html: html }} />
                  </article>
                </div>
              </div>
            </main>
          </div>
        </div>


        <div
          aria-hidden="true"
          className={cn(
            "fixed inset-0 z-[105] bg-black/60 transition-opacity duration-300 ease-out lg:hidden",
            mobileNavOpen ? "opacity-100" : "pointer-events-none opacity-0",
          )}
          onClick={() => setMobileNavOpen(false)}
        />

        <nav
          aria-label="Legal navigation"
          className={cn(
            "fixed inset-x-0 bottom-0 z-[110] flex max-h-[85dvh] flex-col bg-[#000057] text-[#f2f2f2] transition-[border-radius,transform] duration-300 ease-out lg:hidden",
            mobileNavOpen ? "rounded-t-[24px]" : "rounded-t-none",
          )}
        >
          <div
            className={cn(
              "grid min-h-0 transition-[grid-template-rows] duration-300 ease-out",
              mobileNavOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
            )}
          >
            <div className="flex min-h-0 flex-col overflow-hidden">
              <div className="flex shrink-0 justify-center pb-[calc(11*var(--u))] pt-[calc(17*var(--u))]">
                <div aria-hidden="true" className="h-[calc(6*var(--u))] w-[calc(69*var(--u))] bg-[#f2f2f2]" />
              </div>

              <div
                data-lenis-prevent=""
                className={cn(
                  "flex min-h-0 flex-1 flex-col gap-[calc(7*var(--u))] overflow-y-auto overscroll-contain px-[5px] pb-[calc(20*var(--u))] pt-[calc(11*var(--u))] transition-opacity duration-200",
                  mobileNavOpen ? "opacity-100 delay-100" : "opacity-0",
                )}
              >
                <Link
                  aria-current={kind === "terms" ? "page" : undefined}
                  className={cn(
                    "relative flex min-h-[44px] items-center gap-4 px-5 font-['Rules_Variable','Arial_Narrow',sans-serif] text-sm font-medium uppercase no-underline [font-variation-settings:'wdth'_50]",
                    kind === "terms" && "before:absolute before:bottom-2 before:left-3 before:top-2 before:w-px before:bg-current",
                  )}
                  href="/terms"
                  onClick={() => setMobileNavOpen(false)}
                >
                  <span className="inline-flex size-4 shrink-0 items-center justify-center [&_svg]:size-full"><TermsIcon /></span>
                  <span>Terms</span>
                  <span className="min-w-0 flex-1 border-b border-dotted border-[#f2f2f2]/20" />
                </Link>

                <Link
                  aria-current={kind === "privacy" ? "page" : undefined}
                  className={cn(
                    "relative flex min-h-[44px] items-center gap-4 px-5 font-['Rules_Variable','Arial_Narrow',sans-serif] text-sm font-medium uppercase no-underline [font-variation-settings:'wdth'_50]",
                    kind === "privacy" && "before:absolute before:bottom-2 before:left-3 before:top-2 before:w-px before:bg-current",
                  )}
                  href="/privacy"
                  onClick={() => setMobileNavOpen(false)}
                >
                  <span className="inline-flex size-4 shrink-0 items-center justify-center [&_svg]:size-full"><PrivacyIcon /></span>
                  <span>Privacy</span>
                  <span className="min-w-0 flex-1 border-b border-dotted border-[#f2f2f2]/20" />
                </Link>

                <Link
                  aria-current={kind === "about" ? "page" : undefined}
                  className={cn(
                    "relative flex min-h-[44px] items-center gap-4 px-5 font-['Rules_Variable','Arial_Narrow',sans-serif] text-sm font-medium uppercase no-underline [font-variation-settings:'wdth'_50]",
                    kind === "about" && "before:absolute before:bottom-2 before:left-3 before:top-2 before:w-px before:bg-current",
                  )}
                  href="/about"
                  onClick={() => setMobileNavOpen(false)}
                >
                  <span className="inline-flex size-4 shrink-0 items-center justify-center [&_svg]:size-full"><AboutIcon /></span>
                  <span>About Us</span>
                  <span className="min-w-0 flex-1 border-b border-dotted border-[#f2f2f2]/20" />
                </Link>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-between gap-[calc(18*var(--u))] px-[5px] py-[calc(12*var(--u))]">
            <div className="grid min-w-0 justify-items-start">
              <Link
                aria-label="Home"
                className={cn(
                  "col-start-1 row-start-1 flex items-center transition-opacity duration-200",
                  mobileNavOpen ? "pointer-events-none opacity-0" : "opacity-100",
                )}
                href="/"
              >
                <img alt="" aria-hidden="true" className="h-[calc(52*var(--u))] w-auto shrink-0 object-contain" src="/logo.webp" />
              </Link>

              <Link
                className={cn(
                  "col-start-1 row-start-1 flex items-center gap-[calc(12*var(--u))] bg-[#f2f2f2]/20 p-[calc(12*var(--u))] font-['Rules_Variable','Arial_Narrow',sans-serif] text-sm font-medium uppercase no-underline transition-[opacity,background-color] duration-200 hover:bg-[#f2f2f2]/60 [font-variation-settings:'wdth'_50]",
                  mobileNavOpen ? "opacity-100" : "pointer-events-none opacity-0",
                )}
                href="/login"
              >
                <span>Login</span>
                <span className="inline-flex size-[calc(28*var(--u))] items-center justify-center [&_svg]:size-full"><LoginIcon /></span>
              </Link>
            </div>

            <div className="flex shrink-0 items-center gap-[calc(18*var(--u))]">
              {!mobileNavOpen ? (
                <Link
                  className="flex items-center justify-center gap-[calc(12*var(--u))] bg-[#f2f2f2]/20 p-[calc(12*var(--u))] font-['Rules_Variable','Arial_Narrow',sans-serif] text-sm font-medium uppercase no-underline transition-colors duration-150 hover:bg-[#f2f2f2]/60 [font-variation-settings:'wdth'_50]"
                  href="/login"
                >
                  <span>Login</span>
                  <span className="inline-flex size-[calc(28*var(--u))] items-center justify-center [&_svg]:size-full"><LoginIcon /></span>
                </Link>
              ) : null}

              <button
                aria-expanded={mobileNavOpen}
                aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"}
                className="grid cursor-pointer place-items-center bg-[#f2f2f2]/20 p-[calc(12*var(--u))] text-inherit transition-colors duration-150 hover:bg-[#f2f2f2]/60 focus-visible:outline-none [&_svg]:size-[calc(28*var(--u))]"
                onClick={() => setMobileNavOpen((open) => !open)}
                type="button"
              >
                {mobileNavOpen ? <CloseIcon /> : <MenuIcon />}
              </button>
            </div>
          </div>
        </nav>
      </div>
    </div>
  );
}
