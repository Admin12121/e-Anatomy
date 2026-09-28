"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";

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
};

const DEFAULT_HERO_IMAGE =
  "./footer.avif";
const DEFAULT_BRAND_MARK =
  "/logo.webp";

const NOISE_BG =
  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.72' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 1 1 1 0 -1.55'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

const defaultColumns: RevealFooterColumn[] = [
  {
    eyebrow: "Platform",
    title: "Portal",
    links: [
      { label: "Create account", href: "/login" },
      { label: "Sign in", href: "/login" },
      { label: "About us", href: "/aboutus" },
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
  }: Required<
    Pick<
      HermesRevealFooterProps,
      "animationLerp" | "revealStartVh" | "revealRangeVh" | "liftDecay"
    >
  >,
) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let viewportHeight = window.innerHeight;
    let documentLimit = Math.max(
      1,
      document.documentElement.scrollHeight - viewportHeight,
    );
    let naturalTop = 0;
    let overlap = 0;
    let targetScroll = window.scrollY;
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
          (overlap * (1 - Math.exp(-liftDecay * (1 - progress)))) /
          liftDecay;
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

    const requestTick = () => {
      targetScroll = window.scrollY;
      if (!raf) raf = window.requestAnimationFrame(tick);
    };

    const measure = () => {
      viewportHeight = window.innerHeight;
      documentLimit = Math.max(
        1,
        document.documentElement.scrollHeight - viewportHeight,
      );
      const marginTop =
        Number.parseFloat(window.getComputedStyle(root).marginTop) || 0;
      overlap = Math.max(0, -marginTop);
      naturalTop = root.getBoundingClientRect().top + window.scrollY + overlap;
      targetScroll = window.scrollY;
      animatedScroll = targetScroll;
      update(animatedScroll);
    };

    const onResize = () => window.requestAnimationFrame(measure);

    measure();
    window.addEventListener("scroll", requestTick, { passive: true });
    window.addEventListener("resize", onResize);
    document.fonts?.ready.then(() => !disposed && measure());

    const image = root.querySelector<HTMLImageElement>("[data-footer-hero-image]");
    if (image && !image.complete) {
      image.addEventListener("load", measure, { once: true });
    }

    return () => {
      disposed = true;
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener("scroll", requestTick);
      window.removeEventListener("resize", onResize);
      image?.removeEventListener("load", measure);
    };
  }, [animationLerp, liftDecay, revealRangeVh, revealStartVh, rootRef]);
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
      const effectiveMeasured = Math.max(1, measured - sourceMarginCompensation);
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

function DiscordIcon() {
  return (
    <svg viewBox="-3.36 -3.36 30.72 30.72" aria-hidden="true">
      <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
    </svg>
  );
}

function GithubIcon() {
  return (
    <svg viewBox="-3.36 -3.36 30.72 30.72" aria-hidden="true">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="-3.36 -3.36 30.72 30.72" aria-hidden="true">
      <path d="M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z" />
    </svg>
  );
}

const plainLinkClass =
  "underline [text-decoration-color:color-mix(in_oklab,currentColor_25%,transparent)] [text-decoration-thickness:from-font] transition-[text-decoration-color,opacity] duration-150 ease-out hover:opacity-100 hover:[text-decoration-color:currentColor] hover:duration-0";

export function Footer({
  className = "",
  brand = "The Voxel Anatomy",
  tagline = "Interactive Anatomy Atlases.",
  email = "info@thevoxelanatomy.com",
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
}: HermesRevealFooterProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const ghostTextRef = useRef<HTMLSpanElement>(null);

  useGhostWordFit(rootRef, ghostTextRef, heroWord);
  useFooterReveal(rootRef, {
    animationLerp,
    revealStartVh,
    revealRangeVh,
    liftDecay,
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
        "md:z-0 md:mt-[-100dvh] md:h-auto md:min-h-0 md:bg-transparent",
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
          "md:sticky md:top-0 md:z-0 md:flex md:min-h-dvh md:flex-col",
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
              loading="lazy"
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
            <a
              className={`${plainLinkClass} opacity-60`}
              href={`mailto:${email}`}
            >
              {email}
            </a>
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
            <a
              aria-label="Discord"
              className="inline-flex items-center justify-center py-2 pr-2 transition-opacity duration-150 hover:opacity-60 [&_svg]:size-6 [&_svg]:fill-current [&_svg]:stroke-current"
              href="https://discord.gg/nousresearch"
              rel="noopener noreferrer"
              target="_blank"
            >
              <DiscordIcon />
            </a>
            <a
              aria-label="GitHub"
              className="inline-flex items-center justify-center p-2 transition-opacity duration-150 hover:opacity-60 [&_svg]:size-5 [&_svg]:fill-current [&_svg]:stroke-current"
              href="https://github.com/NousResearch/hermes-agent"
              rel="noopener noreferrer"
              target="_blank"
            >
              <GithubIcon />
            </a>
            <a
              aria-label="X"
              className="inline-flex items-center justify-center p-2 transition-opacity duration-150 hover:opacity-60 [&_svg]:size-5 [&_svg]:fill-current [&_svg]:stroke-current"
              href="https://x.com/NousResearch"
              rel="noopener noreferrer"
              target="_blank"
            >
              <XIcon />
            </a>
          </div>

          <p className="order-1 md:order-none text-center">{copyright}</p>
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

      <div aria-hidden="true" className="hidden h-dvh md:block" />
    </div>
  );
}

export function HermesRevealFooterMockLeadIn() {
  return (
    <section className="relative z-10 min-h-[155dvh] bg-[#f2f2f2] font-[Arial,sans-serif] text-[#000091]">
      <div className="sticky top-0 z-[2] grid min-h-24 grid-cols-3 items-center gap-5 border-b border-[#000091]/10 bg-[#f2f2f2]/95 px-[7vw] text-center text-[11px] tracking-[.12em] md:grid-cols-7">
        <span>NOUS</span>
        <span>HERMES</span>
        <span>DOCS</span>
        <strong className="hidden text-[28px] font-normal md:block">翼</strong>
        <span className="hidden md:block">COMMUNITY</span>
        <span className="hidden md:block">PORTAL</span>
        <span className="hidden justify-self-center bg-[#0000f2] px-3.5 py-[11px] text-[#f2f2f2] md:block">
          INSTALL HERMES
        </span>
      </div>
      <div className="flex min-h-[calc(155dvh-96px)] flex-col items-center justify-end gap-3.5 px-6 pb-[120px] pt-20 text-center">
        <p className="m-0 text-[clamp(34px,6vw,84px)] leading-[.9]">
          MOCK CONTENT ABOVE THE REVEAL FOOTER
        </p>
        <span className="text-xs tracking-[.12em]">
          Scroll down to reproduce the footer reveal transition.
        </span>
      </div>
    </section>
  );
}

export default Footer;
