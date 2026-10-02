import { expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import Link from "next/link";

let sessionState = { data: null, isPending: false };
mock.module("@/lib/auth-client", () => ({
  authClient: { useSession: () => sessionState },
}));
mock.module("next/navigation", () => ({
  useRouter: () => ({ back() {}, push() {} }),
}));
mock.module("next-transition-router", () => ({
  useTransitionRouter: () => ({ push() {} }),
}));

const { PortalLegalShell } = await import("./portal-legal-shell");
const renderLegal = () =>
  renderToStaticMarkup(
    <PortalLegalShell
      kind="terms"
      title="Terms of service"
      html="<p>Terms content</p>"
    />,
  );

test("legal account prompts are visible only for a confirmed signed-out session", () => {
  sessionState = { data: null, isPending: false };
  const html = renderLegal();
  expect(html).toContain("Create Voxel Account");
  expect(html).toContain("Member Sign in");
  expect(html).toContain("Terms content");
  expect(html).toContain('aria-label="Home"');
});

test("signed-in legal pages hide both desktop and mobile account prompts, not the logo", () => {
  sessionState = { data: { user: { id: "signed-in-user" } }, isPending: false };
  const html = renderLegal();
  expect(html).not.toContain("Create Voxel Account");
  expect(html).not.toContain("Member Sign in");
  expect(html).not.toContain('href="/login"');
  expect(html).toContain('aria-label="Home"');
});

test("pending authentication does not flash signed-out account prompts", () => {
  sessionState = { data: null, isPending: true };
  expect(renderLegal()).not.toContain('href="/login"');
});

test("an unavailable session check is not treated as a signed-out session", () => {
  sessionState = {
    data: null,
    isPending: false,
    error: { message: "Unavailable" },
  };
  expect(renderLegal()).not.toContain('href="/login"');
});

test("structures use the actual legal frame with a navigation slot and a separate tools column", () => {
  sessionState = { data: null, isPending: false };
  const html = renderToStaticMarkup(
    <PortalLegalShell
      kind="terms"
      title="Structures"
      workspace={{
        path: "/structures/head/brain",
        navigation: () => (
          <input aria-label="Search structures" type="search" />
        ),
        content: <article>Brain explanation</article>,
        tools: <Link href="/head/brain">Open Brain viewer</Link>,
        footer: <footer>Structure footer</footer>,
      }}
    />,
  );
  expect(html).toContain('data-portal-document="structures"');
  expect(html).toContain('data-portal-scroll=""');
  expect(html).toContain('aria-label="Explore this modality"');
  expect(html).toContain('aria-label="Search structures"');
  expect(html).toContain("Brain explanation");
  expect(html).toContain("Structure footer");
  expect(html).toContain('aria-label="Back to home"');
  expect(html).not.toContain("Create Voxel Account");
});
