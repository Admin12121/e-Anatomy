"use client"

import { createContext, useContext, type ReactNode } from "react"

type PreloaderStateValue = {
  isPreloaderActive: boolean
  isPreloaderReady: boolean
  isPreloaderTransitioningOut: boolean
  openPreloader: (mode?: PreloaderStartMode) => void
}

export type PreloaderStartMode = "intro" | "ready" | "restore"

const DEFAULT_PRELOADER_STATE: PreloaderStateValue = {
  isPreloaderActive: false,
  isPreloaderReady: false,
  isPreloaderTransitioningOut: false,
  openPreloader: () => {},
}

const PreloaderStateContext = createContext<PreloaderStateValue>(DEFAULT_PRELOADER_STATE)

type PreloaderStateProviderProps = {
  children: ReactNode
  value: PreloaderStateValue
}

export function PreloaderStateProvider({
  children,
  value,
}: PreloaderStateProviderProps) {
  return <PreloaderStateContext.Provider value={value}>{children}</PreloaderStateContext.Provider>
}

export function usePreloaderState() {
  return useContext(PreloaderStateContext)
}
