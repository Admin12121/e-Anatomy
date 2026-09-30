"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type DailyValue = { date: string; views: number; engaged: number };
const metrics = {
  views: { label: "Views", color: "var(--chart-2)" },
  engaged: { label: "Engaged views", color: "var(--chart-1)" },
};

function dateLabel(value: string, full = false) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    ...(full ? { year: "numeric" } : {}),
  });
}

/** The supplied interactive bar-chart pattern, driven only by API report values. */
export function ContentTrendChart({
  data,
  days,
  title = "Views over time",
  initialMetric = "views",
}: {
  data: DailyValue[];
  days: number;
  title?: string;
  initialMetric?: keyof typeof metrics;
}) {
  const [active, setActive] = useState(initialMetric);
  const totals = data.reduce(
    (sum, day) => ({
      views: sum.views + day.views,
      engaged: sum.engaged + day.engaged,
    }),
    { views: 0, engaged: 0 },
  );
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex flex-col items-stretch border-b p-0 sm:flex-row">
        <div className="flex flex-1 flex-col justify-center gap-1 px-5 py-4">
          <CardTitle>{title}</CardTitle>
          <p className="text-xs text-muted-foreground">Last {days} days</p>
        </div>
        <div className="flex">
          {(Object.keys(metrics) as (keyof typeof metrics)[]).map((key) => (
            <button
              type="button"
              key={key}
              aria-pressed={active === key}
              data-active={active === key}
              className="flex min-w-0 flex-1 flex-col justify-center gap-1 border-t px-5 py-4 text-left outline-none even:border-l focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring data-[active=true]:bg-muted/60 sm:min-w-32 sm:border-t-0 sm:border-l"
              onClick={() => setActive(key)}
            >
              <span className="text-xs text-muted-foreground">
                {metrics[key].label}
              </span>
              <span className="text-2xl font-semibold leading-none tabular-nums">
                {totals[key].toLocaleString()}
              </span>
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="min-w-0 p-3 sm:p-5">
        {data.length ? (
          <div
            className="h-[280px] min-w-0 w-full text-xs"
            role="group"
            aria-label={`${metrics[active].label} by day`}
          >
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart
                accessibilityLayer
                data={data}
                margin={{ top: 8, right: 8, left: 0, bottom: 4 }}
              >
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={10}
                  minTickGap={32}
                  tickFormatter={(value) => dateLabel(String(value))}
                  tick={{ fill: "var(--muted-foreground)" }}
                />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  width={38}
                  tick={{ fill: "var(--muted-foreground)" }}
                />
                <Tooltip
                  isAnimationActive={false}
                  cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                  content={({ active: visible, label, payload }) => {
                    if (!visible || !payload?.length) return null;
                    return (
                      <div className="min-w-36 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
                        <p className="mb-2 font-medium">
                          {dateLabel(String(label), true)}
                        </p>
                        <div className="flex items-center justify-between gap-4">
                          <span>{metrics[active].label}</span>
                          <strong className="tabular-nums">
                            {Number(payload[0].value).toLocaleString()}
                          </strong>
                        </div>
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey={active}
                  name={metrics[active].label}
                  fill={metrics[active].color}
                  maxBarSize={48}
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No views recorded in this period.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function ContentDimensionChart({
  title,
  data,
}: {
  title: string;
  data: { label: string; value: number }[];
}) {
  const values = [...data].sort((a, b) => b.value - a.value).slice(0, 10);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {values.length ? (
          <div
            className="min-w-0 w-full"
            style={{ height: Math.max(160, values.length * 38) }}
            role="group"
            aria-label={`${title} by views`}
          >
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart
                accessibilityLayer
                data={values}
                layout="vertical"
                margin={{ right: 24, left: 0 }}
              >
                <CartesianGrid horizontal={false} stroke="var(--border)" />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={120}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                  tickFormatter={(value) =>
                    String(value).length > 19
                      ? `${String(value).slice(0, 18)}…`
                      : String(value)
                  }
                />
                <Tooltip
                  isAnimationActive={false}
                  cursor={{ fill: "var(--muted)" }}
                  content={({ active, payload }) =>
                    !active || !payload?.length ? null : (
                      <div className="max-w-72 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
                        <p className="break-words font-medium">
                          {String(payload[0].payload.label)}
                        </p>
                        <p className="mt-1">
                          {Number(payload[0].value).toLocaleString()} views
                        </p>
                      </div>
                    )
                  }
                />
                <Bar
                  dataKey="value"
                  name="Views"
                  fill="var(--chart-2)"
                  radius={[0, 3, 3, 0]}
                  maxBarSize={22}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No data in this period.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
