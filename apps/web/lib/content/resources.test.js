import { expect, test } from "bun:test";
import { resourcePage, isResourceEditor } from "./resources";

const rows = Array.from({ length: 43 }, (_, index) => ({
  id: String(index),
  title: `Modality ${index}`,
  href: "/",
  revision: 2,
  publishedRevision: index % 3 === 0 ? null : index % 3 === 1 ? 2 : 1,
}));

test("resource search matches modality titles before pagination", () => {
  expect(resourcePage(rows, { search: " MODALITY 42 " }).items[0].id).toBe(
    "42",
  );
  expect(resourcePage(rows, { search: "modality" }).total).toBe(43);
  expect(resourcePage(rows, { search: "missing" }).total).toBe(0);
});
test("old publication states never hide resources", () => {
  for (const status of ["draft", "published", "unpublished_changes"]) {
    expect(resourcePage(rows, { status }).total).toBe(43);
  }
});

test("pagination clamps invalid and out-of-range pages", () => {
  expect(resourcePage(rows, { page: "2" }).items[0].id).toBe("20");
  expect(resourcePage(rows, { page: "999" }).items.length).toBe(3);
  expect(resourcePage(rows, { page: "NaN" }).page).toBe(1);
  expect(resourcePage(rows, { page: "-1" }).page).toBe(1);
  expect(resourcePage([], { page: "99" }).page).toBe(1);
});
test("only article routes receive article navigation", () => {
  const base = "/content/brain";
  expect(isResourceEditor(`${base}/resources`, base)).toBe(false);
  expect(isResourceEditor(`${base}/overview`, base)).toBe(false);
  expect(isResourceEditor(`${base}/resources/modality`, base)).toBe(true);
  expect(isResourceEditor(`${base}/resources/labels/123`, base)).toBe(true);
});
