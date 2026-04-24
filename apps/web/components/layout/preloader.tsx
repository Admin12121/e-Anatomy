"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import gsap from "gsap"
import { CustomEase } from "gsap/CustomEase"
import { useLenis } from "lenis/react"

import type { PreloaderStartMode } from "./preloader-state"

import { cn } from "@/lib/utils"

gsap.registerPlugin(CustomEase)

CustomEase.create("preloader-hop", "0.9, 0, 0.1, 1")
CustomEase.create("preloader-glide", "0.8, 0, 0.2, 1")

type PreloaderProps = {
  onComplete?: () => void
  onEngage?: () => void
  onReady?: () => void
  startMode?: PreloaderStartMode
}

const BACKDROP_ROWS = [
  [
    [
      "ARC//117 Delta Trace",
      "ARC//117 Delta Trace",
      "ARC//117 Delta Trace",
      "ARC//117 Delta Trace",
      "ARC//117 Delta Trace",
    ],
    ["Sector / Hollow Frame", "0.392 02SD 008923"],
    ["Material / Unknown Fiber", "Status / Soft Resonance"],
    "logo",
    [":::..:::.::::..:::"],
  ],
  [
    ["Surface Memory"],
    ["// / / ///// / / / ///"],
    ["Phase Offset > 17%"],
    ["Fragments Aligning", "Pattern Emerging"],
    ["Collapse Pending", "Return -- Layer Zero"],
    ["F-9"],
  ],
] as const

function MaskedLine({
  className,
  text,
}: {
  className?: string
  text: string
}) {
  return (
    <span className={cn("line-mask", className)}>
      <span className="line">{text}</span>
    </span>
  )
}

export default function Preloader({
  onComplete,
  onEngage,
  onReady,
  startMode = "intro",
}: PreloaderProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const backdropRef = useRef<HTMLDivElement | null>(null)
  const shellRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const buttonSvgRef = useRef<SVGSVGElement | null>(null)
  const buttonLogoRef = useRef<HTMLDivElement | null>(null)
  const trackRef = useRef<SVGCircleElement | null>(null)
  const progressRef = useRef<SVGCircleElement | null>(null)
  const introTimelineRef = useRef<gsap.core.Timeline | null>(null)
  const exitTimelineRef = useRef<gsap.core.Timeline | null>(null)
  const pathLengthRef = useRef(0)
  const readyRef = useRef(false)

  const [showPreloader, setShowPreloader] = useState(true)
  const [isReady, setIsReady] = useState(false)
  const [isExiting, setIsExiting] = useState(false)
  const lenis = useLenis()

  useEffect(() => {
    lenis?.stop()

    return () => {
      lenis?.start()
    }
  }, [lenis])

  useEffect(() => {
    if (!showPreloader) {
      return
    }

    const backdrop = backdropRef.current
    const shell = shellRef.current
    const button = buttonRef.current
    const buttonSvg = buttonSvgRef.current
    const buttonLogo = buttonLogoRef.current
    const track = trackRef.current
    const progress = progressRef.current
    const hero = document.querySelector<HTMLElement>(".hero")
    const heroRevealer = document.querySelector<HTMLElement>(".preloader-revealer")
    const shellLines = gsap.utils.toArray<HTMLElement>(".preloader .p-row p .line")
    const engageLines = gsap.utils.toArray<HTMLElement>("#pbc-label .line")
    const outroLines = gsap.utils.toArray<HTMLElement>("#pbc-outro-label .line")
    const heroWords = gsap.utils.toArray<HTMLElement>(".hero h1 .word")

    if (!backdrop || !shell || !button || !buttonSvg || !buttonLogo || !track || !progress || !hero || !heroRevealer) {
      return
    }

    const pathLength = track.getTotalLength()

    pathLengthRef.current = pathLength
    readyRef.current = false

    gsap.set(shellLines, { y: "100%" })
    gsap.set(engageLines, { y: "100%" })
    gsap.set(outroLines, { y: "100%" })
    gsap.set(heroWords, { y: "100%" })
    gsap.set(buttonLogo, { autoAlpha: 1 })
    gsap.set(button, { scale: 1 })
    gsap.set(buttonSvg, { rotate: 0, transformOrigin: "50% 50%" })
    gsap.set(shell, { clearProps: "display" })
    gsap.set([backdrop, shell], {
      clipPath: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
    })
    gsap.set(shell, { scale: 1, transformOrigin: "50% 50%" })
    gsap.set(hero, { scale: 0.75, transformOrigin: "50% 50%" })
    gsap.set(heroRevealer, {
      clipPath: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
    })
    gsap.set([track, progress], {
      strokeDasharray: pathLength,
      strokeDashoffset: pathLength,
    })

    if (startMode === "ready") {
      gsap.set(shellLines, { y: "0%" })
      gsap.set(engageLines, { y: "0%" })
      gsap.set(outroLines, { y: "100%" })
      gsap.set(buttonLogo, { autoAlpha: 0 })
      gsap.set(button, { scale: 0.9 })
      gsap.set(buttonSvg, { rotate: 270, transformOrigin: "50% 50%" })
      gsap.set([track, progress], { strokeDashoffset: 0 })
      readyRef.current = true
      const readyFrame = window.requestAnimationFrame(() => {
        setIsReady(true)
        onReady?.()
      })
      return () => window.cancelAnimationFrame(readyFrame)
    }

    const introTimeline =
      startMode === "restore"
        ? gsap.timeline({
            onComplete: () => {
              readyRef.current = true
              setIsReady(true)
              onReady?.()
            },
          })
        : gsap.timeline({ delay: 1 })

    if (startMode === "restore") {
      gsap.set(shellLines, { y: "0%" })
      gsap.set(engageLines, { y: "-100%" })
      gsap.set(outroLines, { y: "0%" })
      gsap.set(buttonLogo, { autoAlpha: 0 })
      gsap.set(button, { scale: 0.9 })
      gsap.set(buttonSvg, { rotate: 270, transformOrigin: "50% 50%" })
      gsap.set(backdrop, { display: "none" })
      gsap.set(shell, {
        clipPath: "polygon(0% 0%, 0% 0%, 0% 100%, 0% 100%)",
        scale: 0.75,
        transformOrigin: "50% 50%",
      })
      gsap.set([track, progress], {
        strokeDashoffset: -pathLength,
      })

      introTimeline
        .to(shell, {
          clipPath: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
          duration: 1.5,
          ease: "preloader-hop",
        })
        .to(
          shell,
          {
            scale: 1,
            duration: 1.25,
            ease: "preloader-hop",
          },
          1.5,
        )
        .to(
          [track, progress],
          {
            strokeDashoffset: 0,
            duration: 1.25,
            ease: "preloader-hop",
          },
          1.5,
        )
        .to(
          outroLines,
          {
            y: "-100%",
            duration: 0.75,
            ease: "power3.out",
          },
          1.75,
        )
        .to(
          engageLines,
          {
            y: "0%",
            duration: 0.75,
            ease: "power3.out",
          },
          2,
        )

      introTimelineRef.current = introTimeline

      return () => {
        introTimeline.kill()
        introTimelineRef.current = null
      }
    }

    introTimeline
      .to(shellLines, {
        y: "0%",
        duration: 0.75,
        ease: "power3.out",
        stagger: 0.1,
      })
      .to(
        track,
        {
          strokeDashoffset: 0,
          duration: 2,
          ease: "preloader-hop",
        },
        "<",
      )
      .to(
        buttonSvg,
        {
          rotate: 270,
          duration: 2,
          ease: "preloader-hop",
        },
        "<",
      )

    ;[0.2, 0.25, 0.85, 1].forEach((baseStop, index) => {
      const stop = index === 3 ? 1 : baseStop + (Math.random() - 0.5) * 0.1

      introTimeline.to(progress, {
        strokeDashoffset: pathLength - pathLength * stop,
        duration: 0.75,
        ease: "preloader-glide",
        delay: index === 0 ? 0.3 : 0.3 + Math.random() * 0.2,
      })
    })

    introTimeline
      .to(
        buttonLogo,
        {
          autoAlpha: 0,
          duration: 0.35,
          ease: "power1.out",
        },
        "-=0.25",
      )
      .to(
        button,
        {
          scale: 0.9,
          duration: 1.5,
          ease: "preloader-hop",
        },
        "-=0.5",
      )
      .to(
        engageLines,
        {
          y: "0%",
          duration: 0.75,
          ease: "power3.out",
          onComplete: () => {
            readyRef.current = true
            setIsReady(true)
            onReady?.()
          },
        },
        "-=0.75",
      )

    introTimelineRef.current = introTimeline

    return () => {
      introTimeline.kill()
      introTimelineRef.current = null
    }
  }, [onReady, showPreloader, startMode])

  const handleEngage = () => {
    const backdrop = backdropRef.current
    const shell = shellRef.current
    const button = buttonRef.current
    const track = trackRef.current
    const progress = progressRef.current
    const hero = document.querySelector<HTMLElement>(".hero")
    const heroRevealer = document.querySelector<HTMLElement>(".preloader-revealer")
    const heroWords = gsap.utils.toArray<HTMLElement>(".hero h1 .word")

    if (
      !showPreloader ||
      !readyRef.current ||
      isExiting ||
      !backdrop ||
      !shell ||
      !button ||
      !track ||
      !progress ||
      !hero ||
      !heroRevealer
    ) {
      return
    }

    const engageLines = gsap.utils.toArray<HTMLElement>("#pbc-label .line")
    const outroLines = gsap.utils.toArray<HTMLElement>("#pbc-outro-label .line")
    const pathLength = pathLengthRef.current || track.getTotalLength()

    readyRef.current = false
    setIsReady(false)
    setIsExiting(true)
    onEngage?.()

    exitTimelineRef.current?.kill()
    exitTimelineRef.current = gsap.timeline({
      onComplete: () => {
        setShowPreloader(false)
        setIsExiting(false)
        onComplete?.()
      },
    })

    exitTimelineRef.current
      .to(shell, {
        scale: 0.75,
        duration: 1.25,
        ease: "preloader-hop",
      })
      .to(
        [track, progress],
        {
          strokeDashoffset: -pathLength,
          duration: 1.25,
          ease: "preloader-hop",
        },
        "<",
      )
      .to(
        engageLines,
        {
          y: "-100%",
          duration: 0.75,
          ease: "power3.out",
        },
        "-=1.25",
      )
      .to(
        outroLines,
        {
          y: "0%",
          duration: 0.75,
          ease: "power3.out",
        },
        "-=0.75",
      )
      .to(shell, {
        clipPath: "polygon(0% 0%, 0% 0%, 0% 100%, 0% 100%)",
        duration: 1.5,
        ease: "preloader-hop",
      })
      .to(
        heroRevealer,
        {
          clipPath: "polygon(0% 0%, 0% 0%, 0% 100%, 0% 100%)",
          duration: 1.5,
          ease: "preloader-hop",
          onComplete: () => {
            gsap.set(shell, { display: "none" })
          },
        },
        "-=1.45",
      )
      .to(hero, {
        scale: 1,
        duration: 1.25,
        ease: "preloader-hop",
      })
      .to(
        heroWords,
        {
          y: "0%",
          duration: 1,
          ease: "preloader-glide",
          stagger: 0.05,
        },
        "-=1.75",
      )
  }

  useEffect(() => {
    return () => {
      introTimelineRef.current?.kill()
      exitTimelineRef.current?.kill()
    }
  }, [])

  if (!showPreloader) {
    return null
  }

  return (
    <div ref={wrapperRef} className="fixed inset-0 z-[10000000]">
      <div ref={backdropRef} className="preloader-backdrop">
        {BACKDROP_ROWS.map((row, rowIndex) => (
          <div key={`backdrop-row-${rowIndex}`} className="pb-row">
            {row.map((column, columnIndex) => (
              <div
                key={`backdrop-row-${rowIndex}-col-${columnIndex}`}
                className={cn(
                  "pb-col",
                  rowIndex === 0 && columnIndex <= 1 && "hidden md:block",
                  rowIndex === 0 && columnIndex === 4 && "hidden md:block",
                )}
              >
                {column === "logo" ? (
                  <div className="relative">
                    <Image
                      id="pb-logo"
                      src="/logo.webp"
                      alt=""
                      width={40}
                      height={40}
                      sizes="40px"
                      className="rounded-md dark:rounded-none object-contain"
                    />
                  </div>
                ) : (
                  column.map((line, lineIndex) => (
                    <p key={`backdrop-line-${rowIndex}-${columnIndex}-${lineIndex}`}>
                      {line}
                    </p>
                  ))
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div ref={shellRef} className="preloader">
        <div className="p-row">
          <p>
            <MaskedLine text="Initiating" />
          </p>
        </div>

        <div className="p-row">
          <div className="p-col">
            <div className="p-sub-col">
              <p>
                <MaskedLine text="Phase 01" />
              </p>
              <p>
                <MaskedLine text="Sequence" />
              </p>
            </div>
            <div className="p-sub-col">
              <p>
                <MaskedLine text="Signal Scan" />
              </p>
              <p>
                <MaskedLine text="07 Layers" />
              </p>
            </div>
          </div>

          <div className="p-col">
            <p>
              <MaskedLine text="PX-17" />
            </p>
          </div>
        </div>

        <button
          ref={buttonRef}
          type="button"
          aria-label="Engage"
          className={cn("preloader-btn-container", isReady && !isExiting ? "cursor-pointer" : "cursor-default")}
          onClick={handleEngage}
        >
          <div ref={buttonLogoRef} id="pbc-logo">
            <Image
              src="/preloader.webp"
              alt=""
              width={64}
              height={64}
              sizes="64px"
              className="h-full w-full object-cover"
            />
          </div>

          <p id="pbc-label">
            <MaskedLine text="Engage" />
          </p>

          <p id="pbc-outro-label">
            <MaskedLine text="Access Granted" />
          </p>

          <div className="pbc-svg-strokes">
            <svg
              ref={buttonSvgRef}
              viewBox="0 0 320 320"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle ref={trackRef} cx="160" cy="160" r="155" stroke="#2b2b2b" strokeWidth="2" />
              <circle
                ref={progressRef}
                cx="160"
                cy="160"
                r="155"
                stroke="#ffffff"
                strokeWidth="2"
              />
            </svg>
          </div>
        </button>
      </div>
    </div>
  )
}
