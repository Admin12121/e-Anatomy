import type { Metadata } from "next";

import { PortalLegalShell } from "../_legal/portal-legal-shell";
import { PRIVACY_HTML, PRIVACY_LAST_UPDATED } from "../_legal/legal-content";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Privacy Policy",
};

export default function PrivacyPage() {
  return (
    <PortalLegalShell
      html={PRIVACY_HTML}
      kind="privacy"
      title="Privacy Policy"
      updated={PRIVACY_LAST_UPDATED}
    />
  );
}
