import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CompactFooter } from "./footer";

test("structures footer contains only the X icon, credit and legal links", () => {
  const html = renderToStaticMarkup(<CompactFooter />);
  expect(html).toContain('aria-label="X"');
  expect(html).not.toContain('aria-label="Discord"');
  expect(html).not.toContain('aria-label="GitHub"');
  expect(html).not.toContain("NousResearch");
  expect(html).toContain("Designed and developed by");
  expect(html).toContain("Admin12121");
  expect(html).toContain('href="/terms"');
  expect(html).toContain('href="/privacy"');
  expect(html).toContain("bg-transparent");
  expect(html).not.toContain("HermesRevealFooter");
  expect(html).not.toContain("<img");
  expect(html).not.toContain("Create account");
  expect(html).not.toContain("Platform");
  expect(html).not.toContain("--hfc-viewport");
});
