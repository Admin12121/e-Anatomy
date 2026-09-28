import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

export type LegalMdxSlug = "about" | "privacy" | "terms";

export type LegalMdxDocument = {
  html: string;
  title: string;
  updated: string | null;
};

const LEGAL_CONTENT_FILES: Record<LegalMdxSlug, string> = {
  about: path.join(
    process.cwd(),
    "app/(app)/(client)/_legal/content/about.mdx",
  ),
  privacy: path.join(
    process.cwd(),
    "app/(app)/(client)/_legal/content/privacy.mdx",
  ),
  terms: path.join(
    process.cwd(),
    "app/(app)/(client)/_legal/content/terms.mdx",
  ),
};

function unquote(value: string) {
  const trimmed = value.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function parseMdxSource(source: string): LegalMdxDocument {
  const normalized = source.replace(/\r\n/g, "\n");

  if (!normalized.startsWith("---\n")) {
    return {
      html: normalized.trim(),
      title: "",
      updated: null,
    };
  }

  const frontmatterEnd = normalized.indexOf("\n---\n", 4);

  if (frontmatterEnd === -1) {
    return {
      html: normalized.trim(),
      title: "",
      updated: null,
    };
  }

  const metadata = new Map<string, string>();
  const frontmatter = normalized.slice(4, frontmatterEnd);

  for (const line of frontmatter.split("\n")) {
    const separator = line.indexOf(":");

    if (separator === -1) continue;

    const key = line.slice(0, separator).trim().toLowerCase();
    const value = unquote(line.slice(separator + 1));

    if (key) metadata.set(key, value);
  }

  return {
    html: normalized.slice(frontmatterEnd + 5).trim(),
    title: metadata.get("title") ?? "",
    updated: metadata.get("updated") ?? null,
  };
}

export async function loadLegalMdx(slug: LegalMdxSlug) {
  const source = await readFile(LEGAL_CONTENT_FILES[slug], "utf8");
  return parseMdxSource(source);
}
