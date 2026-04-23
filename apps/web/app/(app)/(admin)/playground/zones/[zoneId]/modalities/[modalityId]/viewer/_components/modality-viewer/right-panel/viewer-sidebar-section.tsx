import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function ViewerSidebarSection({
  actions,
  children,
  title,
  className,
  border = true,
}: {
  actions?: ReactNode;
  children: ReactNode;
  title: string;
  className?: string;
  border?: boolean;
}) {
  return (
    <section
      className={cn(
        "py-4 dark:border-white/8",
        className,
        border ? "border-t first:border-t-0 first:pt-0" : "",
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
