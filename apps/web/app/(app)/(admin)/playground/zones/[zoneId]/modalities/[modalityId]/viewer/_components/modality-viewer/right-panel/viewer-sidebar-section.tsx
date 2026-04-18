import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function ViewerSidebarSection({
  actions,
  children,
  title,
  className,
}: {
  actions?: ReactNode;
  children: ReactNode;
  title: string;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "border-t py-4 first:border-t-0 first:pt-0 dark:border-white/8",
        className,
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">{title}</div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
