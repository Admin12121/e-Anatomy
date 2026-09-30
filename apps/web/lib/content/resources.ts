import { documentStatus } from "./documents";

export type ResourceRow = {
  id: string;
  title: string;
  href: string;
  revision: number;
  publishedRevision: number | null;
};

export const RESOURCE_PAGE_SIZE = 20;

export function resourcePage(
  rows: ResourceRow[],
  query: {
    search?: string;
    status?: string;
    page?: string;
  },
) {
  const search = (query.search ?? "").trim().toLowerCase();
  const filtered = rows.filter((row) => {
    const status = documentStatus(row).toLowerCase().replaceAll(" ", "_");
    return (
      (!search || row.title.toLowerCase().includes(search)) &&
      (!query.status || query.status === "all" || status === query.status)
    );
  });
  const totalPages = Math.max(
    1,
    Math.ceil(filtered.length / RESOURCE_PAGE_SIZE),
  );
  const requested = Number(query.page);
  const page =
    Number.isSafeInteger(requested) && requested > 0
      ? Math.min(requested, totalPages)
      : 1;
  return {
    items: filtered.slice(
      (page - 1) * RESOURCE_PAGE_SIZE,
      page * RESOURCE_PAGE_SIZE,
    ),
    page,
    totalPages,
    total: filtered.length,
  };
}

export function isResourceEditor(pathname: string, base: string) {
  return (
    pathname === `${base}/resources/modality` ||
    pathname.startsWith(`${base}/resources/labels/`)
  );
}
