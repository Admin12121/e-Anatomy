import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import Loader from "./loader";

test("multiple default cube loaders keep their SVG patterns and stars isolated", () => {
  const html = renderToStaticMarkup(
    <>
      <Loader />
      <Loader />
    </>,
  );
  const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]);
  expect(new Set(ids).size).toBe(ids.length);
  for (const [svg] of html.matchAll(/<svg\b.*?<\/svg>/g)) {
    const ownIds = new Set(
      [...svg.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]),
    );
    for (const [, href, fill] of svg.matchAll(
      /href="#([^"]+)"|fill="url\(#([^)]*)\)"/g,
    )) {
      expect(ownIds.has(href ?? fill)).toBe(true);
    }
    expect(svg).toContain('viewBox="0 0 512 512"');
    expect(svg).toContain("<pattern");
    expect(svg).toContain('repeatCount="indefinite"');
    expect(svg).toContain(
      'd="M10 64 L128 0 L246 64 L246 192 L128 256 L10 192Z"',
    );
  }
});
