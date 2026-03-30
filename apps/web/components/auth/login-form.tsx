"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition, type FormEvent } from "react"

import { useAuthSession } from "@/components/auth/auth-session-provider"
import { browserApiFetch } from "@/lib/api/browser"
import { ApiClientError } from "@/lib/api/errors"
import type { SessionResponse } from "@/lib/auth/types"
import { Button } from "@/components/ui/button"
import { Panel } from "@/components/layout/panel"

export function LoginForm() {
  const router = useRouter()
  const { replaceSession } = useAuthSession()
  const [isPending, startTransition] = useTransition()
  const [email, setEmail] = useState("admin@gmail.com")
  const [password, setPassword] = useState("admin@#12")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)

    startTransition(() => {
      void submitLogin()
    })
  }

  async function submitLogin() {
    try {
      const session = await browserApiFetch<SessionResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      })

      replaceSession(session)
      router.replace("/admin/dashboard")
    } catch (error) {
      if (error instanceof ApiClientError) {
        setErrorMessage(error.message)
        return
      }

      setErrorMessage("Unable to reach the authentication service.")
    }
  }

  return (
    <Panel className="max-w-xl">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Credentials</p>
          <h2 className="font-heading text-2xl font-semibold tracking-tight text-slate-950">
            Admin sign-in
          </h2>
        </div>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-slate-700">Email</span>
          <input
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-950 shadow-sm outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-slate-700">Password</span>
          <input
            required
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-950 shadow-sm outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10"
          />
        </label>

        {errorMessage ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        <Button type="submit" size="lg" className="w-full" disabled={isPending}>
          {isPending ? "Signing in..." : "Continue to dashboard"}
        </Button>
      </form>
    </Panel>
  )
}
