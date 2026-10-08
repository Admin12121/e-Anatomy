"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { ROUTE_TRANSITION_SETTLED_EVENT } from "@/components/layout/transition-events";
import ShinyText from "@/components/shiny-text";
import Link from "next/link";

export type RevealFooterLink = {
  label: ReactNode;
  href: string;
  external?: boolean;
  prefix?: ReactNode;
};

export type RevealFooterColumn = {
  eyebrow: ReactNode;
  title: ReactNode;
  links: RevealFooterLink[];
};

export type HermesRevealFooterProps = {
  className?: string;
  brand?: string;
  tagline?: ReactNode;
  email?: string;
  heroWord?: string;
  heroImageSrc?: string;
  brandMarkSrc?: string;
  brandMarkAlt?: string;
  columns?: RevealFooterColumn[];
  copyright?: ReactNode;
  openSourceLabel?: ReactNode;
  licenseLabel?: ReactNode;
  termsHref?: string;
  privacyHref?: string;
  primaryColor?: string;
  foregroundColor?: string;
  accentColor?: string;
  contentWidth?: string;
  horizontalPadding?: string;
  ghostWordMax?: string;
  animationLerp?: number;
  revealStartVh?: number;
  revealRangeVh?: number;
  liftDecay?: number;
  /** Optional document-frame scroller; home retains its window-based reveal. */
  scrollContainerSelector?: string;
};

const DEFAULT_HERO_IMAGE = "./footer.avif";
const DEFAULT_BRAND_MARK = "/logo.webp";

const NOISE_BG =
  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.72' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 1 1 1 0 -1.55'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

const defaultColumns: RevealFooterColumn[] = [
  {
    eyebrow: "Platform",
    title: "Portal",
    links: [
      { label: "Create account", href: "/login" },
      { label: "Sign in", href: "/login" },
      { label: "About us", href: "/about" },
      {
        label: "Plans",
        href: "#soon",
      },
    ],
  },
];

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function useFooterReveal(
  rootRef: React.RefObject<HTMLDivElement | null>,
  {
    animationLerp,
    revealStartVh,
    revealRangeVh,
    liftDecay,
    scrollContainerSelector,
  }: Required<
    Pick<
      HermesRevealFooterProps,
      "animationLerp" | "revealStartVh" | "revealRangeVh" | "liftDecay"
    >
  > &
    Pick<HermesRevealFooterProps, "scrollContainerSelector">,
) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const scrollContainer = scrollContainerSelector
      ? root.closest<HTMLElement>(scrollContainerSelector)
      : null;
    const scrollTarget = scrollContainer ?? window;
    const readScroll = () => scrollContainer?.scrollTop ?? window.scrollY;
    const readHeight = () =>
      scrollContainer?.clientHeight ?? window.innerHeight;

    const readDocumentLimit = (height = readHeight()) =>
      Math.max(
        1,
        (scrollContainer?.scrollHeight ??
          document.documentElement.scrollHeight) - height,
      );

    let viewportHeight = readHeight();
    let documentLimit = readDocumentLimit(viewportHeight);
    let naturalTop = 0;
    let overlap = 0;
    let targetScroll = readScroll();
    let animatedScroll = targetScroll;
    let raf = 0;
    let disposed = false;
    let lastOpacity = -1;
    let lastLift = "";

    const update = (rawScroll: number) => {
      const scroll = clamp(rawScroll, 0, documentLimit);
      const opacity = clamp(
        (revealStartVh * viewportHeight - (naturalTop - scroll)) /
          (revealRangeVh * viewportHeight),
        0,
        1,
      );

      if (opacity !== lastOpacity) {
        lastOpacity = opacity;
        root.style.setProperty("--hfc-footer-opacity", `${opacity}`);
        root.style.setProperty(
          "--hfc-footer-pe",
          opacity > 0.98 ? "auto" : "none",
        );
      }

      if (overlap > 0) {
        const progress = clamp(1 - (naturalTop - scroll) / overlap, 0, 1);
        const lift =
          (overlap * (1 - Math.exp(-liftDecay * (1 - progress)))) / liftDecay;
        const nextLift = `${lift.toFixed(1)}px`;

        if (nextLift !== lastLift) {
          lastLift = nextLift;
          root.style.setProperty("--hfc-footer-lift", nextLift);
        }
      }
    };

    const tick = () => {
      if (disposed) return;

      const delta = targetScroll - animatedScroll;
      if (Math.abs(delta) < 0.08) {
        animatedScroll = targetScroll;
        update(animatedScroll);
        raf = 0;
        return;
      }

      animatedScroll += delta * animationLerp;
      update(animatedScroll);
      raf = window.requestAnimationFrame(tick);
    };

    const measure = () => {
      if (disposed) return;

      viewportHeight = readHeight();
      if (scrollContainer)
        root.style.setProperty("--hfc-viewport", `${viewportHeight}px`);
      documentLimit = readDocumentLimit(viewportHeight);
      const marginTop =
        Number.parseFloat(window.getComputedStyle(root).marginTop) || 0;
      overlap = Math.max(0, -marginTop);
      naturalTop =
        root.getBoundingClientRect().top -
        (scrollContainer?.getBoundingClientRect().top ?? 0) +
        readScroll() +
        overlap;
      targetScroll = readScroll();
      animatedScroll = targetScroll;
      update(animatedScroll);
    };

    const requestTick = () => {
      // The footer can mount while the route-transition stage is fixed and
      // therefore outside normal document flow. Once the stage is unpinned,
      // scrollHeight changes without necessarily producing a resize event.
      // Detect that geometry change before using stale reveal measurements.
      const nextLimit = readDocumentLimit();
      if (Math.abs(nextLimit - documentLimit) > 1) {
        measure();
        return;
      }

      targetScroll = readScroll();
      if (!raf) raf = window.requestAnimationFrame(tick);
    };

    const onResize = () => window.requestAnimationFrame(measure);
    const onTransitionSettled = () => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(measure);
      });
    };

    const resizeObserver = new ResizeObserver(() => {
      window.requestAnimationFrame(measure);
    });

    measure();
    resizeObserver.observe(root);
    resizeObserver.observe(document.body);
    if (scrollContainer) resizeObserver.observe(scrollContainer);
    scrollTarget.addEventListener("scroll", requestTick, { passive: true });
    window.addEventListener("resize", onResize);
    window.addEventListener(
      ROUTE_TRANSITION_SETTLED_EVENT,
      onTransitionSettled,
    );
    document.fonts?.ready.then(() => !disposed && measure());

    const image = root.querySelector<HTMLImageElement>(
      "[data-footer-hero-image]",
    );
    if (image && !image.complete) {
      image.addEventListener("load", measure, { once: true });
    }

    return () => {
      disposed = true;
      if (raf) window.cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      scrollTarget.removeEventListener("scroll", requestTick);
      window.removeEventListener("resize", onResize);
      window.removeEventListener(
        ROUTE_TRANSITION_SETTLED_EVENT,
        onTransitionSettled,
      );
      image?.removeEventListener("load", measure);
    };
  }, [
    animationLerp,
    liftDecay,
    revealRangeVh,
    revealStartVh,
    rootRef,
    scrollContainerSelector,
  ]);
}

function useGhostWordFit(
  rootRef: React.RefObject<HTMLDivElement | null>,
  textRef: React.RefObject<HTMLSpanElement | null>,
  text: ReactNode,
) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    const visibleText = textRef.current;
    if (!root || !visibleText) return;

    let raf = 0;
    let observer: ResizeObserver | null = null;

    const fit = () => {
      const line = visibleText.closest<HTMLElement>("[data-footer-hero-word]");
      if (!line) return;

      const lineStyle = window.getComputedStyle(line);
      const available = Math.max(
        1,
        line.clientWidth -
          (Number.parseFloat(lineStyle.paddingLeft) || 0) -
          (Number.parseFloat(lineStyle.paddingRight) || 0),
      );

      const maxValue = window
        .getComputedStyle(root)
        .getPropertyValue("--hfc-ghost-word")
        .trim();
      const maxPx = Number.parseFloat(maxValue) || 304;
      const textStyle = window.getComputedStyle(visibleText);

      const probe = document.createElement("span");
      probe.textContent = visibleText.textContent ?? String(text ?? "");
      Object.assign(probe.style, {
        position: "fixed",
        left: "-10000px",
        top: "-10000px",
        visibility: "hidden",
        pointerEvents: "none",
        whiteSpace: "nowrap",
        fontFamily: textStyle.fontFamily,
        fontWeight: textStyle.fontWeight,
        fontStyle: textStyle.fontStyle,
        fontStretch: textStyle.fontStretch,
        letterSpacing: "0px",
        fontSize: `${maxPx}px`,
        lineHeight: "1",
        textTransform: "uppercase",
      });
      document.body.appendChild(probe);

      const measured = probe.getBoundingClientRect().width;
      probe.remove();

      const sourceMarginCompensation = maxPx * 0.059;
      const effectiveMeasured = Math.max(
        1,
        measured - sourceMarginCompensation,
      );
      const fitted = Math.min(maxPx, (maxPx * available) / effectiveMeasured);

      root.style.setProperty("--hfc-fit-size", `${fitted.toFixed(3)}px`);
    };

    const schedule = () => {
      if (raf) window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(fit);
    };

    schedule();
    observer = new ResizeObserver(schedule);
    observer.observe(root);
    document.fonts?.ready.then(schedule);

    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      observer?.disconnect();
    };
  }, [rootRef, text, textRef]);
}

const bodyTextClass =
  "font-['Rules_Variable',Arial,sans-serif] [font-stretch:50%] [font-variation-settings:'wdth'_50] text-[12px] leading-none tracking-[.1em] uppercase";

const contentWidthClass =
  "relative mx-auto w-full max-w-[calc(var(--hfc-col)+2*var(--hfc-pad-x))] px-[var(--hfc-pad-x)]";

function FooterColumn({ column }: { column: RevealFooterColumn }) {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <p className="opacity-60">{column.eyebrow}</p>
      <p className="font-['Rules_Gothic_Compressed','Times_New_Roman',sans-serif] text-[20px] font-normal leading-[1.4] tracking-normal normal-case">
        {column.title}
      </p>
      <ul className="my-[calc(var(--hfc-footer-row-pad)*-1)] flex list-none flex-col p-0">
        {column.links.map((link, index) => (
          <li className="flex" key={`${String(link.label)}-${index}`}>
            <a
              className="group -ml-1 inline-flex self-start whitespace-nowrap py-[var(--hfc-footer-row-pad)] text-inherit no-underline"
              href={link.href}
              {...(link.external
                ? { target: "_blank", rel: "noopener noreferrer" }
                : {})}
            >
              <span className="inline-flex h-[var(--hfc-chip-h)] items-center rounded-r-[2px] px-1 transition-[color,background-color] duration-150 ease-out group-hover:bg-[var(--hfc-fg)] group-hover:text-[var(--hfc-primary)] group-hover:duration-0">
                {link.prefix}
                {link.prefix ? " " : null}
                {link.label}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function XIcon() {
  return (
    <svg viewBox="-3.36 -3.36 30.72 30.72" aria-hidden="true">
      <path d="M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z" />
    </svg>
  );
}

// The VoxelAnatomy X account; until it exists the icon shows without a link.
const X_URL = "";

function XLink() {
  const className =
    "inline-flex items-center justify-center py-2 pr-2 transition-opacity duration-150 hover:opacity-60 [&_svg]:size-5 [&_svg]:fill-current [&_svg]:stroke-current";
  return X_URL ? (
    <a aria-label="X" className={className} href={X_URL} rel="noopener noreferrer" target="_blank">
      <XIcon />
    </a>
  ) : (
    <span aria-label="X" className={className} role="img">
      <XIcon />
    </span>
  );
}

// Verge InfoTech has no site link yet; admin12121 keeps its existing one.
function Credit({ className }: { className: string }) {
  return (
    <div className={className}>
      <span className="font-light opacity-50">Design and development by</span>
      <ShinyText
        text="Verge InfoTech"
        duration={2}
        delay={1}
        className="text-xs font-[600]"
      />
      <span className="font-light opacity-50">in collaboration with</span>
      <Link href="https://admin12121.com" target="_blank" rel="noopener noreferrer">
        <ShinyText
          text="admin12121"
          duration={2}
          delay={1}
          className="text-xs font-[600]"
        />
      </Link>
    </div>
  );
}

const plainLinkClass =
  "underline [text-decoration-color:color-mix(in_oklab,currentColor_25%,transparent)] [text-decoration-thickness:from-font] transition-[text-decoration-color,opacity] duration-150 ease-out hover:opacity-100 hover:[text-decoration-color:currentColor] hover:duration-0";

export function Footer({
  className = "",
  brand = "The Voxel Anatomy",
  tagline = "Interactive Anatomy Atlases.",
  heroWord = brand,
  heroImageSrc = DEFAULT_HERO_IMAGE,
  brandMarkSrc = DEFAULT_BRAND_MARK,
  brandMarkAlt = brand,
  columns = defaultColumns,
  copyright = "© 2026, The Voxel Anatomy, Inc.",
  termsHref = "/terms",
  privacyHref = "/privacy",
  primaryColor = "#0000f2",
  foregroundColor = "#f2f2f2",
  accentColor = "#f2f200",
  contentWidth = "1080px",
  horizontalPadding = "max(24px, min(6vw, 80px))",
  ghostWordMax = "304px",
  animationLerp = 0.09,
  revealStartVh = 0.72,
  revealRangeVh = 0.38,
  liftDecay = 3.2,
  scrollContainerSelector,
}: HermesRevealFooterProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const ghostTextRef = useRef<HTMLSpanElement>(null);

  useGhostWordFit(rootRef, ghostTextRef, heroWord);
  useFooterReveal(rootRef, {
    animationLerp,
    revealStartVh,
    revealRangeVh,
    liftDecay,
    scrollContainerSelector,
  });

  const style = useMemo(
    () =>
      ({
        "--hfc-primary": primaryColor,
        "--hfc-fg": foregroundColor,
        "--hfc-accent": accentColor,
        "--hfc-vsq": "calc(.5vw + .5vh)",
        "--hfc-frame": "calc(2.5 * var(--hfc-vsq))",
        "--hfc-col": contentWidth,
        "--hfc-pad-x": horizontalPadding,
        "--hfc-chip-h": "18px",
        "--hfc-footer-row-pad": "calc((28px - var(--hfc-chip-h)) / 2)",
        "--hfc-ghost-word": ghostWordMax,
        "--hfc-footer-opacity": 0,
        "--hfc-footer-lift": "0px",
        "--hfc-footer-pe": "none",
      }) as React.CSSProperties,
    [
      accentColor,
      contentWidth,
      foregroundColor,
      ghostWordMax,
      horizontalPadding,
      primaryColor,
    ],
  );

  return (
    <div
      ref={rootRef}
      className={[
        "relative isolate w-full bg-[var(--hfc-primary)] text-[var(--hfc-fg)]",
        "font-['Rules_Variable',Arial,sans-serif] uppercase antialiased",
        "[font-synthesis:none] [text-rendering:optimizeLegibility]",
        "md:z-0 md:mt-[calc(-1*var(--hfc-viewport,100dvh))] md:h-auto md:min-h-0 md:bg-transparent",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={style}
      data-component="HermesRevealFooter"
    >
      <footer
        className={[
          "relative block h-auto min-h-0 overflow-visible bg-[var(--hfc-primary)] text-[var(--hfc-fg)]",
          "[opacity:calc(.4+.6*var(--hfc-footer-opacity,0))]",
          "[filter:blur(calc(10px*(1-var(--hfc-footer-opacity,0))))]",
          "[pointer-events:var(--hfc-footer-pe,none)]",
          "will-change-[opacity,filter,transform]",
          "motion-reduce:opacity-100 motion-reduce:[filter:none] motion-reduce:transform-none",
          "md:sticky md:top-0 md:z-0 md:flex md:min-h-[var(--hfc-viewport,100dvh)] md:flex-col",
          "md:pb-[var(--hfc-frame)] md:[transform:translateY(var(--hfc-footer-lift,0px))]",
        ].join(" ")}
      >
        <div className="relative isolate bg-[var(--hfc-primary)] md:h-auto md:flex-1">
          <div className="absolute inset-0 isolate mix-blend-plus-lighter">
            <img
              alt=""
              data-footer-hero-image
              className="absolute inset-0 block h-full w-full select-none object-cover object-top [-webkit-user-drag:none]"
              decoding="async"
              draggable={false}
              fetchPriority="high"
              loading="eager"
              src={heroImageSrc}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-repeat opacity-90"
              style={{
                backgroundImage: NOISE_BG,
                backgroundPosition: "0 0",
                backgroundSize: "12.8rem 12.8rem",
              }}
            />
          </div>

          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-[linear-gradient(to_bottom,transparent,var(--hfc-primary)_86%)]"
            aria-hidden="true"
          />

          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 opacity-[var(--hfc-footer-opacity,0)] [transform:translateY(calc(38%+(1-var(--hfc-footer-opacity,0))*45%))] will-change-[transform,opacity] motion-reduce:opacity-100 motion-reduce:[transform:translateY(32%)]"
            aria-hidden="true"
          >
            <p
              data-footer-hero-word
              className={[
                "mx-auto w-full max-w-[calc(var(--hfc-col)+2*var(--hfc-pad-x))] px-[var(--hfc-pad-x)] text-center",
                "font-['Rules_Gothic_Compressed','Times_New_Roman',serif] font-normal uppercase",
                "whitespace-nowrap text-[#f2f2f2] opacity-15",
                "leading-none tracking-0 select-none",
                "[text-box-edge:cap_alphabetic] [text-box-trim:trim-both]",
              ].join(" ")}
            >
              <span
                ref={ghostTextRef}
                className="block w-full whitespace-nowrap [margin-inline:-.03em_-.029em]"
                style={{
                  fontSize:
                    "var(--hfc-fit-size, clamp(96px, 18vw, var(--hfc-ghost-word)))",
                }}
              >
                {heroWord}
              </span>
            </p>
          </div>
        </div>

        <div
          className={[
            contentWidthClass,
            bodyTextClass,
            "grid grid-cols-2 gap-x-6 gap-y-10 pb-10",
            "md:grid-cols-[minmax(0,320px)_repeat(4,minmax(0,1fr))] md:gap-5",
          ].join(" ")}
        >
          <div className="col-span-2 flex flex-col gap-5 md:col-auto">
            <img
              alt={brandMarkAlt}
              className="block h-[86px] w-[60px] select-none object-contain [-webkit-user-drag:none]"
              draggable={false}
              height={86}
              src={brandMarkSrc}
              width={60}
            />
            <p className="m-0">{tagline}</p>
            <p className={`${plainLinkClass} opacity-60`}>{copyright}</p>
          </div>

          {columns.slice(0, 4).map((column, index) => (
            <FooterColumn
              column={column}
              key={`${String(column.title)}-${index}`}
            />
          ))}
        </div>

        <div
          className={[
            contentWidthClass,
            bodyTextClass,
            "grid grid-cols-2 gap-5 py-10",
            "md:grid-cols-[minmax(0,320px)_repeat(2,minmax(0,1fr))]",
          ].join(" ")}
        >
          <div className="col-span-2 flex items-center md:col-auto">
            <XLink />
          </div>

          <Credit className="order-1 flex flex-wrap items-center justify-center gap-x-1 gap-y-1 text-center md:order-none" />
          <p className="order-1 md:order-none text-right">
            <a className={plainLinkClass} href={termsHref}>
              Terms
            </a>
            <span className="mx-2">|</span>
            <a className={plainLinkClass} href={privacyHref}>
              Privacy
            </a>
          </p>
        </div>
      </footer>

      <div
        aria-hidden="true"
        className="hidden h-[var(--hfc-viewport,100dvh)] md:block"
      />
    </div>
  );
}

/** Structures only need the bottom links, on the document's own background. */
export function CompactFooter() {
  return (
    <footer
      aria-label="Site footer"
      data-compact-footer=""
      className={`${bodyTextClass} grid w-full grid-cols-2 items-center gap-x-4 gap-y-5 bg-transparent text-inherit xl:grid-cols-[auto_minmax(0,1fr)_auto]`}
    >
      <div className="flex items-center">
        <XLink />
      </div>
      <Credit className="order-last col-span-2 flex flex-wrap items-center justify-center gap-x-1 gap-y-2 text-center leading-relaxed xl:order-none xl:col-span-1" />
      <p className="m-0 text-right">
        <Link className={plainLinkClass} href="/terms">
          Terms
        </Link>
        <span className="mx-2" aria-hidden="true">
          |
        </span>
        <Link className={plainLinkClass} href="/privacy">
          Privacy
        </Link>
      </p>
    </footer>
  );
}

export default Footer;
