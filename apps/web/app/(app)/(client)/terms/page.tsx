import type { Metadata } from "next";

import { loadLegalMdx } from "../_legal/load-legal-mdx";
import { PortalLegalShell } from "../_legal/portal-legal-shell";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description:
    "VoxelAnatomy Terms & Conditions: educational use, accuracy, user responsibilities and intellectual property.",
};

export default async function TermsPage() {
  const content = await loadLegalMdx("terms");

  return (
    <PortalLegalShell
      html={content.html}
      kind="terms"
      title={content.title || "Terms & Conditions"}
      updated={content.updated}
    />
  );
}
