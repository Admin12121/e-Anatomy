import Image from "next/image";
import { redirect } from "next/navigation";
import { ProjectRichTextViewer } from "@/components/anatomy/project-rich-text";
import { loadPublicArticle } from "@/lib/content/server";
import { documentValue } from "@/lib/content/documents";
import { PublicArticleMetadata } from "./public-article-shell";
import { ArticleEngagement } from "./article-engagement";
import styles from "./public-article.module.css";

export async function PublicArticle({
  zoneSlug,
  contentSlug,
  structureSlug,
}: {
  zoneSlug: string;
  contentSlug: string;
  structureSlug?: string;
}) {
  const article = await loadPublicArticle(zoneSlug, contentSlug, structureSlug);
  const canonical = `/structures/${article.family.zoneSlug}/${article.family.slug}${article.structureSlug ? `/${article.structureSlug}` : ""}`;
  if (contentSlug !== article.family.slug) redirect(canonical);
  const media = article.document.resources.filter(
    (resource) => resource.kind === "image",
  );
  const references = article.document.resources.filter(
    (resource) => resource.kind !== "image",
  );
  const value = documentValue(article.document);
  return (
    <>
      <PublicArticleMetadata family={article.family} canonical={canonical} />
      <article
        key={canonical}
        className={`${styles.article} mx-auto w-full max-w-[calc(1024*var(--u))] min-w-0 space-y-8 font-['Rules_Variable',Arial,sans-serif] text-base leading-[1.6] normal-case`}
      >
        <h1 className="text-3xl font-semibold leading-tight tracking-tight text-[#0000f2] dark:text-[#f2f2f2] sm:text-4xl">
          {article.title}
        </h1>
        {article.document.summary ? (
          <p className="text-base leading-7 text-muted-foreground">
            {article.document.summary}
          </p>
        ) : null}
        {value === "[]" ? (
          <p className="text-sm leading-7 text-muted-foreground">
            No description added yet. Explore {article.family.name} in the
            viewer
            {article.labels.length
              ? " or select a label from Structures."
              : "."}
          </p>
        ) : (
          <ProjectRichTextViewer
            value={value}
            className="border-0 bg-transparent [&_.bn-editor]:px-0! [&_.bn-editor]:leading-7"
          />
        )}
        {references.length ? (
          <section className="space-y-3 pt-6">
            <h2 className="font-medium">Resources & references</h2>
            <ol className="list-decimal space-y-3 pl-5 text-sm">
              {references.map((resource, index) => (
                <li key={`${resource.url}-${index}`}>
                  <a
                    href={resource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline underline-offset-4"
                  >
                    {resource.title}
                  </a>
                  {resource.caption ? (
                    <p className="mt-1 leading-6 text-muted-foreground">
                      {resource.caption}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>
        ) : null}
        {media.length ? (
          <section className="space-y-4 pt-6">
            <h2 className="font-medium">Gallery</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {media.map((resource, index) => (
                <figure key={`${resource.url}-${index}`} className="min-w-0">
                  <a
                    href={resource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Image
                      src={resource.url}
                      alt={resource.title}
                      width={640}
                      height={480}
                      unoptimized
                      className="aspect-4/3 w-full object-contain"
                    />
                  </a>
                  <figcaption className="mt-2 text-xs leading-5 text-muted-foreground">
                    {resource.caption || resource.title}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        ) : null}
        {article.document.publishedAt ? (
          <p className="pt-4 text-xs text-muted-foreground">
            Updated{" "}
            {new Date(article.document.publishedAt).toLocaleDateString("en", {
              dateStyle: "long",
            })}
          </p>
        ) : null}
      </article>
      <ArticleEngagement
        contentId={article.family.id}
        modalityId={article.family.primaryModalityId}
        zoneId={article.family.zoneId}
        structureId={article.structureId}
      />
    </>
  );
}
