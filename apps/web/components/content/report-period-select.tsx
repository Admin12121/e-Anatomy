"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buildAnalyticsUrl } from "@/lib/analytics/presentation";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const periods = [7, 30, 90].map((days) => ({
  value: String(days),
  label: `Last ${days} days`,
}));

export function ReportPeriodSelect({ days }: { days: number }) {
  const router = useRouter();
  const [value, setValue] = useState(String(days));
  const [pending, startTransition] = useTransition();

  return (
    <Select
      items={periods}
      value={value}
      disabled={pending}
      onValueChange={(next) => {
        if (!next || next === value) return;
        setValue(next);
        const url = new URL(window.location.href);
        startTransition(() =>
          router.push(
            `${buildAnalyticsUrl(url.pathname, url.search, { days: next })}${url.hash}`,
            {
              scroll: false,
            },
          ),
        );
      }}
    >
      <SelectTrigger
        className="w-40"
        aria-label="Reporting period"
        aria-busy={pending}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectPopup>
        {periods.map((period) => (
          <SelectItem key={period.value} value={period.value}>
            {period.label}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}
