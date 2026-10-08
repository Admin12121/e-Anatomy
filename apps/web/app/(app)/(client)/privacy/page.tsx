import type { Metadata } from "next";

import { loadLegalMdx } from "../_legal/load-legal-mdx";
import { PortalLegalShell } from "../_legal/portal-legal-shell";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How VoxelAnatomy collects, uses and protects information, and your data protection rights.",
};

export default async function PrivacyPage() {
  const content = await loadLegalMdx("privacy");

  return (
    <PortalLegalShell
      html={content.html}
      kind="privacy"
      title={content.title || "Privacy Policy"}
      updated={content.updated}
    />
  );
}
