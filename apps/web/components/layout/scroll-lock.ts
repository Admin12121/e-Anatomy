"use client"

export const SCROLL_LOCK_EVENT = "voxel-anatomy:scroll-lock"

type ScrollLockSnapshot = {
  bodyOverflow: string
  bodyOverscrollBehavior: string
  bodyPaddingRight: string
  bodyTouchAction: string
  htmlOverflow: string
  htmlOverscrollBehavior: string
  htmlScrollBehavior: string
  htmlScrollbarGutter: string
  scrollRestoration: History["scrollRestoration"]
}

type ReleaseOptions = {
  x?: number
  y?: number
}

export type ScrollLockHandle = {
  initialX: number
  initialY: number
  release: (options?: ReleaseOptions) => void
}

let activeLocks = 0
let snapshot: ScrollLockSnapshot | null = null
let pendingReleasePosition = { x: 0, y: 0 }

function notifyScrollLock(locked: boolean) {
  window.dispatchEvent(
    new CustomEvent(SCROLL_LOCK_EVENT, {
      detail: { locked },
    }),
  )
}

function applyFirstLock() {
  const html = document.documentElement
  const body = document.body
  const scrollbarWidth = Math.max(0, window.innerWidth - html.clientWidth)
  const computedBodyPaddingRight =
    Number.parseFloat(window.getComputedStyle(body).paddingRight) || 0

  snapshot = {
    bodyOverflow: body.style.overflow,
    bodyOverscrollBehavior: body.style.overscrollBehavior,
    bodyPaddingRight: body.style.paddingRight,
    bodyTouchAction: body.style.touchAction,
    htmlOverflow: html.style.overflow,
    htmlOverscrollBehavior: html.style.overscrollBehavior,
    htmlScrollBehavior: html.style.scrollBehavior,
    htmlScrollbarGutter: html.style.scrollbarGutter,
    scrollRestoration: window.history.scrollRestoration,
  }

  window.history.scrollRestoration = "manual"
  html.dataset.scrollLocked = "true"
  html.style.overflow = "hidden"
  html.style.overscrollBehavior = "none"
  html.style.scrollBehavior = "auto"
  html.style.scrollbarGutter = "stable"
  body.style.overflow = "hidden"
  body.style.overscrollBehavior = "none"
  body.style.touchAction = "none"

  if (scrollbarWidth > 0) {
    body.style.paddingRight = `${computedBodyPaddingRight + scrollbarWidth}px`
  }

  notifyScrollLock(true)
}

function clearLastLock(x: number, y: number) {
  const currentSnapshot = snapshot

  if (!currentSnapshot) {
    return
  }

  const html = document.documentElement
  const body = document.body

  body.style.overflow = currentSnapshot.bodyOverflow
  body.style.overscrollBehavior = currentSnapshot.bodyOverscrollBehavior
  body.style.paddingRight = currentSnapshot.bodyPaddingRight
  body.style.touchAction = currentSnapshot.bodyTouchAction
  html.style.overflow = currentSnapshot.htmlOverflow
  html.style.overscrollBehavior = currentSnapshot.htmlOverscrollBehavior
  html.style.scrollBehavior = currentSnapshot.htmlScrollBehavior
  html.style.scrollbarGutter = currentSnapshot.htmlScrollbarGutter
  window.history.scrollRestoration = currentSnapshot.scrollRestoration
  delete html.dataset.scrollLocked

  snapshot = null
  notifyScrollLock(false)

  window.scrollTo({
    left: x,
    top: y,
    behavior: "auto",
  })
}

export function acquireScrollLock(): ScrollLockHandle {
  const initialX = window.scrollX
  const initialY = window.scrollY

  if (activeLocks === 0) {
    pendingReleasePosition = { x: initialX, y: initialY }
    applyFirstLock()
  }

  activeLocks += 1
  let released = false

  return {
    initialX,
    initialY,
    release(options) {
      if (released) {
        return
      }

      released = true
      pendingReleasePosition = {
        x: options?.x ?? initialX,
        y: options?.y ?? initialY,
      }
      activeLocks = Math.max(0, activeLocks - 1)

      if (activeLocks === 0) {
        clearLastLock(
          pendingReleasePosition.x,
          pendingReleasePosition.y,
        )
      }
    },
  }
}

export function forceReleaseScrollLocks(options?: ReleaseOptions) {
  const x = options?.x ?? pendingReleasePosition.x
  const y = options?.y ?? pendingReleasePosition.y

  activeLocks = 0

  if (snapshot) {
    clearLastLock(x, y)
    return
  }

  // Safety cleanup for an interrupted route transition. This intentionally
  // touches only state owned by this module.
  delete document.documentElement.dataset.scrollLocked
  notifyScrollLock(false)
}

export function setLockedScrollPosition(x = 0, y = 0) {
  window.scrollTo({ left: x, top: y, behavior: "auto" })
}
