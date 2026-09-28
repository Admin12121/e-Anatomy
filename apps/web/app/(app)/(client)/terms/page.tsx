import type { Metadata } from "next";

import { PortalLegalShell } from "../_legal/portal-legal-shell";
import { TERMS_HTML } from "../_legal/legal-content";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms of Service",
};

export default function TermsPage() {
  return <PortalLegalShell html={TERMS_HTML} kind="terms" title="Terms of Service" />;
}
