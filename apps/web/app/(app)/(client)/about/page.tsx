import type { Metadata } from "next";

import { loadLegalMdx } from "../_legal/load-legal-mdx";
import { PortalLegalShell } from "../_legal/portal-legal-shell";

export const metadata: Metadata = {
  title: "About Us",
  description: "About Voxel Anatomy",
};

export default async function AboutPage() {
  const content = await loadLegalMdx("about");

  return (
    <PortalLegalShell
      html={content.html}
      kind="about"
      title={content.title || "About Us"}
      updated={content.updated}
    />
  );
}
