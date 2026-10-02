import type { ReactNode } from "react";
import { PublicArticleShell } from "@/components/content/public-article-shell";
import { loadPublicContentTopics } from "@/lib/content/server";

export default async function StructuresLayout({
  children,
}: {
  children: ReactNode;
}) {
  const topics = await loadPublicContentTopics();
  return <PublicArticleShell topics={topics}>{children}</PublicArticleShell>;
}
