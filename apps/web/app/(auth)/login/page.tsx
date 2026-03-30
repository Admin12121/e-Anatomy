import { LoggedOutOnly } from "@/components/auth/logged-out-only"
import { LoginForm } from "@/components/auth/login-form"
import { AppShell } from "@/components/layout/app-shell"
import { Panel } from "@/components/layout/panel"

export default function LoginPage() {
  return (
    <AppShell>
      <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <Panel tone="dark" className="border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(15,23,42,0.82))] text-white">
          <div className="space-y-5">
            <p className="text-sm uppercase tracking-[0.24em] text-cyan-200/80">Auth review</p>
            <h1 className="font-heading text-4xl font-semibold tracking-tight">
              Sign in to inspect the backend bootstrap.
            </h1>
            <p className="max-w-xl text-sm leading-7 text-slate-300">
              This frontend is intentionally narrow in scope. It verifies session handling,
              protected admin routing, and backend readiness before the imaging and authoring
              surfaces are added.
            </p>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-sm leading-7 text-slate-200">
              <p>Email: <span className="font-medium text-white">admin@gmail.com</span></p>
              <p>Password: <span className="font-medium text-white">admin@#12</span></p>
            </div>
          </div>
        </Panel>

        <LoggedOutOnly>
          <LoginForm />
        </LoggedOutOnly>
      </section>
    </AppShell>
  )
}
