"use client"

import { useEffect, useRef, useState } from "react"
import gsap from "gsap"

import { cn } from "@/lib/utils"

const WAVE_CONFIG = {
  points: 80,
  stretch: 10,
  sinHeight: 1,
  speed: -0.05,
}

export default function MusicToggle() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const waveRef = useRef({ ...WAVE_CONFIG })
  const rafRef = useRef<number | null>(null)
  const renderWaveRef = useRef<(() => void) | null>(null)
  const timeRef = useRef(0)
  const [isPlaying, setIsPlaying] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    const context = canvas.getContext("2d")

    if (!context) {
      return
    }

    const context2d = context
    const canvasElement = canvas

    const size = 40

    canvas.width = size * 2
    canvas.height = size * 2
    canvas.style.width = `${size}px`
    canvas.style.height = `${size}px`

    context2d.scale(2, 2)
    context2d.lineCap = "round"
    context2d.lineJoin = "round"

    const wave = waveRef.current
    const midY = size / 2

    renderWaveRef.current = () => {
      context2d.clearRect(0, 0, size, size)
      context2d.strokeStyle = getComputedStyle(canvasElement).getPropertyValue("color")
      context2d.lineWidth = 1.5

      context2d.beginPath()

      let increment = 0

      for (let index = 0; index <= wave.points; index += 1) {
        increment += index < wave.points / 2 ? 0.1 : -0.1

        const x = (size / wave.points) * index
        const y =
          midY +
          Math.sin(timeRef.current * wave.speed + index / wave.stretch) *
            wave.sinHeight *
            increment

        context2d.lineTo(x, y)
      }

      context2d.stroke()
    }

    renderWaveRef.current()

    return () => {
      renderWaveRef.current = null

      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }

      renderWaveRef.current?.()
      return
    }

    const renderFrame = () => {
      timeRef.current += 1
      renderWaveRef.current?.()
      rafRef.current = window.requestAnimationFrame(renderFrame)
    }

    renderFrame()

    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [isPlaying])

  function handleToggle() {
    const audio = audioRef.current
    const wave = waveRef.current
    const syncWaveFrame = () => renderWaveRef.current?.()

    if (!audio) {
      return
    }

    const nextState = !isPlaying

    setIsPlaying(nextState)
    gsap.killTweensOf(wave)

    if (nextState) {
      void audio.play().catch(() => {
        setIsPlaying(false)
        gsap.to(wave, {
          sinHeight: 1,
          stretch: 10,
          duration: 0.6,
          ease: "power2.out",
          onUpdate: syncWaveFrame,
        })
      })
      gsap.to(wave, {
        sinHeight: 4,
        stretch: 5,
        duration: 0.4,
        ease: "power2.out",
        onUpdate: syncWaveFrame,
      })
      return
    }

    audio.pause()
    gsap.to(wave, {
      sinHeight: 1,
      stretch: 10,
      duration: 0.6,
      ease: "power2.out",
      onUpdate: syncWaveFrame,
    })
  }

  return (
    <>
      <audio ref={audioRef} src="/music/bg.mp3" loop />

      <div className="pointer-events-none fixed left-1/2 top-0 z-20 h-[100svh] w-full -translate-x-1/2">
        <button
          type="button"
          onClick={handleToggle}
          aria-pressed={isPlaying}
          aria-label={isPlaying ? "Mute music" : "Play music"}
          className={cn(
            "pointer-events-auto absolute right-6 top-6 inline-flex h-12 w-18 cursor-pointer items-center justify-center overflow-hidden rounded-[0.4rem] border-0 bg-transparent p-0 text-[var(--base-500)] outline-none transition-colors duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
            isPlaying && "text-[var(--base-500)]",
          )}
        >
          <span className="pointer-events-none absolute inset-0 block" aria-hidden="true">
            <span
              className={cn(
                "absolute inset-0 z-0 rounded-[0.4rem] bg-[var(--base-100)] transition-transform duration-[350ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
                isPlaying ? "scale-90" : "scale-100",
              )}
            />
            <span
              className={cn(
                "absolute inset-0 z-[1] rounded-[0.4rem] bg-[var(--base-300)] transition-transform duration-[350ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
                isPlaying ? "translate-y-0" : "translate-y-full",
              )}
            />
          </span>

          <span className="relative z-[2] flex items-center justify-center">
            <canvas ref={canvasRef} className="block" />
          </span>
        </button>
      </div>
    </>
  )
}
