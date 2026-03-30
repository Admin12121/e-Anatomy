import { Activity, BookOpenCheck, Lock, UserCog } from "lucide-react"

import { ModuleTable } from "@/components/dashboard/module-table"
import { AppShell } from "@/components/layout/app-shell"
import { Panel } from "@/components/layout/panel"
import { Badge } from "@/components/ui/badge"
import { getModules } from "@/lib/api/modules"
import { requireAdminSession } from "@/lib/auth/session"

const reviewCards = [
  {
    title: "Session model",
    copy: "Opaque, database-backed session tokens with HTTP-only cookies and explicit logout.",
    icon: Lock,
  },
  {
    title: "Business boundary",
    copy: "Users authenticate, accounts own content, and memberships carry roles for future expansion.",
    icon: UserCog,
  },
  {
    title: "Content baseline",
    copy: "Modules, versions, and published releases are present so draft/publish flows have a stable base.",
    icon: BookOpenCheck,
  },
]

export default async function DashboardPage() {
  const [session, modules] = await Promise.all([requireAdminSession(), getModules()])

  return (
    <AppShell session={session}>
      <div className="grid gap-6">
        <section className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
          <Panel>
            <div className="space-y-4">
              <Badge variant="secondary" size="lg" className="w-fit">
                Manual review checkpoint
              </Badge>
              <div className="space-y-3">
                <h1 className="font-heading text-3xl font-semibold tracking-tight text-slate-950">
                  Backend and auth bootstrap are wired end to end.
                </h1>
                <p className="max-w-3xl text-sm leading-7 text-slate-600">
                  The dashboard is intentionally small. Its job is to prove that the Docker stack,
                  session flow, admin ownership model, and first domain tables are all behaving
                  correctly before viewer and authoring features are layered on top.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <Metric label="Current role" value={session.account.roleCode} />
                <Metric label="Account" value={session.account.name} />
                <Metric label="Module count" value={String(modules.total)} />
              </div>
            </div>
          </Panel>

          <Panel tone="dark" className="border-slate-900/10 bg-slate-950 text-white">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-200">
                  <Activity className="size-5" />
                </div>
                <div>
                  <p className="text-sm uppercase tracking-[0.24em] text-cyan-200/80">Signed in as</p>
                  <p className="font-medium text-white">{session.user.displayName}</p>
                </div>
              </div>
              <div className="space-y-2 text-sm leading-7 text-slate-300">
                <p>Email: <span className="text-white">{session.user.email}</span></p>
                <p>Session expires: <span className="text-white">{session.session.expiresAt}</span></p>
                <p>Status: <span className="text-white">{session.user.status}</span></p>
              </div>
            </div>
          </Panel>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          {reviewCards.map(({ title, copy, icon: Icon }) => (
            <Panel key={title}>
              <div className="space-y-4">
                <div className="flex size-11 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-700">
                  <Icon className="size-5" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
                  <p className="text-sm leading-7 text-slate-600">{copy}</p>
                </div>
              </div>
            </Panel>
          ))}
        </section>

        <ModuleTable modules={modules.items} />
      </div>
    </AppShell>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-5">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-950">{value}</p>
    </div>
  )
}
