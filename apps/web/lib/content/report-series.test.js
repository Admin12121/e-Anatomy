import { expect, test } from "bun:test";
import { contentReportSeries } from "./report-series";

test("chart fills missing calendar dates without inventing views", () => {
  const data = [
    { date: "2026-09-28", views: 9, engaged: 2 },
    { date: "2026-09-30", views: 24, engaged: 0 },
  ];
  const result = contentReportSeries(data, 7, "2026-09-30");
  expect(result.length).toBe(8);
  expect(result.find((day) => day.date === "2026-09-29")).toEqual({
    date: "2026-09-29",
    views: 0,
    engaged: 0,
  });
  expect(result.reduce((sum, day) => sum + day.views, 0)).toBe(33);
  expect(result.reduce((sum, day) => sum + day.engaged, 0)).toBe(2);
  expect(data.length).toBe(2);
});
test("chart ranges cross month and year boundaries and retain empty state", () => {
  const result = contentReportSeries(
    [{ date: "2027-01-01", views: 1, engaged: 0 }],
    7,
    "2027-01-01",
  );
  expect(result[0].date).toBe("2026-12-25");
  expect(result[7].date).toBe("2027-01-01");
  expect(contentReportSeries([], 30, "2026-09-30")).toEqual([]);
});
