type DailyValue = { date: string; views: number; engaged: number };

/** The API uses an elapsed-days window, including partial first/last UTC days. */
export function contentReportSeries(
  data: DailyValue[],
  days: number,
  through: string,
): DailyValue[] {
  if (!data.length) return [];
  const end = Date.parse(`${through}T00:00:00Z`);
  const count = [7, 30, 90].includes(days) ? days : 30;
  const byDate = new Map(data.map((day) => [day.date, day]));
  return Array.from({ length: count + 1 }, (_, index) => {
    const date = new Date(end - (count - index) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    return byDate.get(date) ?? { date, views: 0, engaged: 0 };
  });
}
