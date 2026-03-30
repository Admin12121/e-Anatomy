import { Badge } from "@/components/ui/badge"
import { Panel } from "@/components/layout/panel"
import type { ModuleListItem } from "@/lib/auth/types"

type ModuleTableProps = {
  modules: ModuleListItem[]
}

export function ModuleTable({ modules }: ModuleTableProps) {
  return (
    <Panel>
      <div className="space-y-5">
        <div className="space-y-2">
          <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Modules</p>
          <h2 className="font-heading text-2xl font-semibold tracking-tight text-slate-950">
            Versioned content baseline
          </h2>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            The schema is ready for module/version/release workflows even though no authoring UI
            has been added yet.
          </p>
        </div>

        {modules.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-5 py-6 text-sm leading-7 text-slate-600">
            No modules have been created yet. That is expected for this bootstrap. The backend path
            is in place for the next pass.
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Latest version</th>
                  <th className="px-4 py-3 font-medium">Current release</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {modules.map((module) => (
                  <tr key={module.id}>
                    <td className="px-4 py-4">
                      <div className="space-y-1">
                        <p className="font-medium text-slate-950">{module.title}</p>
                        <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                          {module.slug}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <Badge variant="outline">{module.status}</Badge>
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {module.latestVersionNo
                        ? `v${module.latestVersionNo} (${module.latestVersionState ?? "unknown"})`
                        : "No versions yet"}
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {module.currentReleasePublishedAt ?? "Not published"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Panel>
  )
}
