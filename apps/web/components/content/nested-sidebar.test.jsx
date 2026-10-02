import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SidebarProvider } from "../ui/sidebar";
import { TooltipProvider } from "../ui/tooltip";
import { ContentSidebarToggle } from "./nested-sidebar";

function controls(open) {
  return renderToStaticMarkup(
    <TooltipProvider>
      <SidebarProvider open={open} persistOpen={false} keyboardShortcut={false}>
        <section data-location="sidebar">
          <ContentSidebarToggle placement="sidebar" />
        </section>
        <section data-location="content">
          <ContentSidebarToggle placement="content" />
        </section>
      </SidebarProvider>
    </TooltipProvider>,
  );
}

test("expanded editor shows only the sidebar collapse control", () => {
  const html = controls(true);
  expect(html.match(/aria-label="Collapse navigation"/g)).toHaveLength(1);
  expect(html).toContain('<section data-location="content"></section>');
});

test("collapsed editor shows only the content header expand control", () => {
  const html = controls(false);
  expect(html.match(/aria-label="Expand navigation"/g)).toHaveLength(1);
  expect(html).toContain('<section data-location="sidebar"></section>');
});
