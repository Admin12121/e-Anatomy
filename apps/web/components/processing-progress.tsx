import { LoaderCircleIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type ProcessingProgressProps = {
  label: string;
  percent: number | null;
  className?: string;
  labelClassName?: string;
  compact?: boolean;
};

export function ProcessingProgress({
  label,
  percent,
  className,
  labelClassName,
  compact = false,
}: ProcessingProgressProps) {
  const safePercent =
    percent === null || !Number.isFinite(percent)
      ? null
      : Math.min(100, Math.max(0, Math.round(percent)));

  return (
    <span
      className={cn(
        "inline-flex min-w-0 max-w-full items-center gap-1.5 normal-case text-muted-foreground",
        className,
      )}
      aria-label={safePercent === null ? label : `${label} ${safePercent}%`}
      title={safePercent === null ? label : `${label} · ${safePercent}%`}
    >
      {safePercent === null ? (
        <LoaderCircleIcon className="size-3.5 shrink-0 animate-spin" />
      ) : (
        <svg
          aria-hidden="true"
          className="size-4 shrink-0 -rotate-90 text-primary"
          viewBox="0 0 20 20"
        >
          <circle
            cx="10"
            cy="10"
            r="7.5"
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.2"
            strokeWidth="2.5"
          />
          <circle
            cx="10"
            cy="10"
            r="7.5"
            fill="none"
            pathLength="100"
            stroke="currentColor"
            strokeDasharray="100"
            strokeDashoffset={100 - safePercent}
            strokeLinecap="round"
            strokeWidth="2.5"
          />
        </svg>
      )}
      {compact ? null : (
        <span className={cn("min-w-0 truncate", labelClassName)}>{label}</span>
      )}
      {safePercent !== null ? (
        <span className="shrink-0 tabular-nums">
          {compact ? `${safePercent}%` : `· ${safePercent}%`}
        </span>
      ) : compact ? (
        <span className="sr-only">{label}</span>
      ) : null}
    </span>
  );
}
