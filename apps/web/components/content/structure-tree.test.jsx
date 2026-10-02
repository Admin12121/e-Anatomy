import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { StructureTree } from "./structure-tree";
import { ModalityPreviewCard } from "./modality-preview-card";

const labels = [
  {
    id: "label-1",
    slug: "cortex",
    title: "Cortex",
    thumbnailUrl: "/cortex.png",
  },
];
const article = {
  family: { id: "brain", slug: "brain", name: "Brain" },
  structureId: null,
  labels,
};
const topics = [
  {
    id: "brain",
    slug: "brain",
    name: "Brain",
    zoneSlug: "head",
    zoneName: "Head",
    thumbnailUrl: "/brain.png",
    labels,
  },
  {
    id: "lungs",
    slug: "lungs",
    name: "Lungs",
    zoneSlug: "head",
    zoneName: "Head",
    thumbnailUrl: "/lungs.png",
    labels: [],
  },
];

test("structures navigation includes all modality thumbnails and canonical label links", () => {
  const html = renderToStaticMarkup(
    <StructureTree article={article} topics={topics} />,
  );
  expect(html).toContain('src="/brain.png"');
  expect(html).toContain('src="/lungs.png"');
  expect(html).toContain('src="/cortex.png"');
  expect(html).toContain('href="/structures/head/brain/cortex"');
  expect(html).toContain('aria-label="Toggle Brain labels"');
  expect(html).toContain('aria-expanded="true"');
  expect(html).toContain('aria-current="page"');
});

test("selecting a label keeps its modality expanded and marks only the label current", () => {
  const html = renderToStaticMarkup(
    <StructureTree
      article={{ ...article, structureId: "label-1" }}
      topics={topics}
    />,
  );
  const currentLinks = html.match(/<a\b[^>]*aria-current="page"[^>]*>/g);
  expect(currentLinks).toHaveLength(1);
  expect(currentLinks[0]).toContain('href="/structures/head/brain/cortex"');
  expect(html).toContain('aria-expanded="true"');
});

test("the legal-style collapsed navigation retains modality links without the label submenu", () => {
  const html = renderToStaticMarkup(
    <StructureTree article={article} topics={topics} collapsed />,
  );
  expect(html).toContain('data-collapsed="true"');
  expect(html).toContain('href="/structures/head/brain"');
  expect(html).toContain('href="/structures/head/lungs"');
  expect(html).not.toContain('href="/structures/head/brain/cortex"');
  expect(html).not.toContain('aria-label="Toggle Brain labels"');
});

test("the shared home card preserves the catalog destination", () => {
  const html = renderToStaticMarkup(
    <ModalityPreviewCard
      name="Brain"
      modalityType="MPR"
      href="/structures/head/brain"
      previewSrc="/brain.png"
    />,
  );
  expect(html).toContain('href="/structures/head/brain"');
  expect(html).toContain('aria-label="Explore Brain"');
});

test("the structures viewer card opens the viewer with an explicit accessible label", () => {
  const html = renderToStaticMarkup(
    <ModalityPreviewCard
      name="Brain"
      modalityType="MPR"
      href="/head/brain"
      previewSrc="/brain.png"
      linkLabel="Open Brain viewer"
      tone="theme"
    />,
  );
  expect(html).toContain('href="/head/brain"');
  expect(html).toContain('aria-label="Open Brain viewer"');
});
