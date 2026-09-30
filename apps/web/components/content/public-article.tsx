import Image from "next/image"
import Link from "next/link"
import { ArrowUpRightIcon } from "lucide-react"
import { redirect } from "next/navigation"
import { ProjectRichTextViewer } from "@/components/anatomy/project-rich-text"
import { PublicAccountMenu } from "@/components/account/public-account-menu"
import { LinkButton } from "@/components/ui/link-button"
import Footer from "@/app/(app)/(client)/_components/footer"
import {
  loadPublicArticle,
  loadPublicContentTopics,
} from "@/lib/content/server"
import { documentValue } from "@/lib/content/documents"
import { StructureTree } from "./structure-tree"
import { CompactAnatomyModel } from "./compact-anatomy-model"
import { ArticleEngagement } from "./article-engagement"

export async function PublicArticle({
  zoneSlug,
  contentSlug,
  structureSlug,
}: {
  zoneSlug: string
  contentSlug: string
  structureSlug?: string
}) {
  const [article, topics] = await Promise.all([
    loadPublicArticle(zoneSlug, contentSlug, structureSlug),
    loadPublicContentTopics(),
  ])
  const canonical = `/structures/${article.family.zoneSlug}/${article.family.slug}${article.structureSlug ? `/${article.structureSlug}` : ""}`
  if (contentSlug !== article.family.slug) redirect(canonical)
  const media = article.document.resources.filter(
    (resource) => resource.kind === "image",
  )
  const references = article.document.resources.filter(
    (resource) => resource.kind !== "image",
  )
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-[90rem] items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-3 font-medium">
            <Image src="/logo.webp" alt="" width={32} height={32} />
            Voxel Anatomy
          </Link>
          <PublicAccountMenu />
        </div>
      </header>
      <div className="mx-auto max-w-[90rem] px-4 py-6 sm:px-6 sm:py-8">
        <nav
          aria-label="Breadcrumb"
          className="mb-6 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
        >
          <Link href="/" className="hover:underline">
            Anatomy
          </Link>
          <span aria-hidden="true">/</span>
          <span>{article.family.zoneName}</span>
          <span aria-hidden="true">/</span>
          {article.structureId &&
          topics.find((topic) => topic.id === article.family.id)?.hasArticle ? (
            <Link
              href={`/structures/${article.family.zoneSlug}/${article.family.slug}`}
              className="hover:underline"
            >
              {article.family.name}
            </Link>
          ) : (
            <span>{article.family.name}</span>
          )}
          {article.structureId ? (
            <>
              <span aria-hidden="true">/</span>
              <span className="text-foreground">{article.title}</span>
            </>
          ) : null}
        </nav>
        <div className="grid items-start gap-8 xl:grid-cols-[15rem_minmax(0,1fr)_17rem] 2xl:gap-10">
          <aside className="hidden min-w-0 xl:sticky xl:top-6 xl:block">
            <StructureTree article={article} topics={topics} />
          </aside>
          <div className="min-w-0 space-y-6">
            <details className="rounded-lg border p-3 xl:hidden">
              <summary className="cursor-pointer text-sm font-medium">
                Browse regions & labels
              </summary>
              <div className="pt-4">
                <StructureTree article={article} topics={topics} />
              </div>
            </details>
            <article className="min-w-0 space-y-6">
              <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
                {article.title}
              </h1>
              {article.document.summary ? (
                <p className="text-base leading-7 text-muted-foreground">
                  {article.document.summary}
                </p>
              ) : null}
              <ProjectRichTextViewer
                value={documentValue(article.document)}
                className="[&_.bn-editor]:px-0!"
                emptyMessage="No additional explanation."
              />
              {references.length ? (
                <section className="space-y-3 border-t pt-6">
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
                <section className="space-y-4 border-t pt-6">
                  <h2 className="font-medium">Gallery</h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {media.map((resource, index) => (
                      <figure
                        key={`${resource.url}-${index}`}
                        className="min-w-0"
                      >
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
                            className="aspect-4/3 w-full rounded-md border object-contain"
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
                <p className="border-t pt-4 text-xs text-muted-foreground">
                  Updated{" "}
                  {new Date(article.document.publishedAt).toLocaleDateString(
                    "en",
                    { dateStyle: "long" },
                  )}
                </p>
              ) : null}
            </article>
          </div>
          <aside className="min-w-0 space-y-5 xl:sticky xl:top-6">
            <section className="space-y-3 rounded-lg border p-3">
              <h2 className="text-sm font-medium">Imaging module</h2>
              <p className="text-sm text-muted-foreground">
                Explore {article.family.name} in the interactive viewer.
              </p>
              {article.family.viewerSlug ? (
                <LinkButton
                  href={`/${article.family.zoneSlug}/${article.family.viewerSlug}`}
                  variant="outline"
                  className="w-full"
                >
                  Open module <ArrowUpRightIcon />
                </LinkButton>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No viewer available.
                </p>
              )}
            </section>
            <CompactAnatomyModel zoneSlug={article.family.zoneSlug} />
          </aside>
        </div>
      </div>
      <ArticleEngagement
        contentId={article.family.id}
        modalityId={article.family.primaryModalityId}
        zoneId={article.family.zoneId}
        structureId={article.structureId}
      />
      <Footer heroImageSrc="/footer.avif" />
    </div>
  )
}
