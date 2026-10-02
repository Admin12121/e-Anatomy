import { ResourceEditorLink } from "@/components/content/resource-editor-link";
import { BrainIcon, ExternalLinkIcon } from "lucide-react";
import { ResourceFilters } from "@/components/content/resource-filters";
import { Frame } from "@/components/ui/frame";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  resourcePage,
  RESOURCE_PAGE_SIZE,
  type ResourceRow,
} from "@/lib/content/resources";
import { loadContentContext, loadContentDocument } from "@/lib/content/server";

export default async function ResourcesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const { user, content } = await loadContentContext(slug);
  const document = await loadContentDocument(user, content.id, "modality");
  const base = `/content/${content.primarySlug}/resources`;
  const query = await searchParams;
  const text = (key: string) =>
    typeof query[key] === "string" ? (query[key] as string) : "";
  const initial = {
    search: text("search").trim(),
  };
  const rows: ResourceRow[] = [
    {
      id: content.id,
      title: content.name,
      href: `${base}/modality`,
      revision: document.revision,
    },
  ];
  const result = resourcePage(rows, { ...initial, page: text("page") });
  const pageQuery = new URLSearchParams();
  for (const [key, value] of Object.entries(initial))
    if (value && value !== "all") pageQuery.set(key, value);
  const paginationBase = pageQuery.size ? `${base}?${pageQuery}` : base;
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <ResourceFilters
        key={pageQuery.toString()}
        base={base}
        initial={initial}
      />
      <Frame>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Modality</TableHead>
              <TableHead className="text-right">Revision</TableHead>
              <TableHead className="w-10">
                <span className="sr-only">Open article</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.items.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <ResourceEditorLink
                    href={row.href}
                    className="flex min-w-0 items-center gap-2 py-1 font-medium hover:underline"
                  >
                    <BrainIcon className="size-4 shrink-0 text-muted-foreground" />
                    <span>{row.title}</span>
                  </ResourceEditorLink>
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {row.revision}
                </TableCell>
                <TableCell>
                  <ResourceEditorLink
                    href={row.href}
                    aria-label={`Open ${row.title}`}
                    className="inline-flex rounded-md p-1 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <ExternalLinkIcon className="size-3.5" />
                  </ResourceEditorLink>
                </TableCell>
              </TableRow>
            ))}
            {!result.items.length ? (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="py-10 text-center text-muted-foreground"
                >
                  No resources match these filters.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </Frame>
      <TablePagination
        baseUrl={paginationBase}
        currentPage={result.page}
        totalPages={result.totalPages}
        totalItems={result.total}
        pageSize={RESOURCE_PAGE_SIZE}
      />
    </div>
  );
}
