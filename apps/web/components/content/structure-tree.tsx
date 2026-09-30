"use client"

import { useId, useState } from "react"
import Link from "next/link"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { ContentArticle, PublicContentTopic } from "@/lib/content/types"

export function StructureTree({
  article,
  topics,
}: {
  article: ContentArticle
  topics: PublicContentTopic[]
}) {
  const searchId = useId()
  const [search, setSearch] = useState("")
  const query = search.trim().toLowerCase()
  const zones = [...new Set(topics.map((topic) => topic.zoneSlug))]
  const visibleLabels = article.labels.filter((label) =>
    label.title.toLowerCase().includes(query),
  )
  const groups = [
    ...new Set(visibleLabels.map((label) => label.groupName ?? "Labels")),
  ]
  const base = `/structures/${article.family.zoneSlug}/${article.family.slug}`
  function link(href: string, title: string, active: boolean) {
    return (
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "block min-w-0 rounded-md px-2 py-2 text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
          active && "bg-muted font-medium",
        )}
      >
        {title}
      </Link>
    )
  }
  return (
    <nav aria-label="Anatomical structures" className="min-w-0 space-y-4">
      <label className="sr-only" htmlFor={searchId}>
        Search anatomical structures
      </label>
      <Input
        id={searchId}
        type="search"
        placeholder="Find a structure…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div
        className="max-h-[60dvh] space-y-2 overflow-y-auto overscroll-contain"
        data-lenis-prevent
      >
        {zones.map((zone) => {
          const zoneTopics = topics.filter(
            (topic) =>
              topic.zoneSlug === zone &&
              (!query ||
                topic.name.toLowerCase().includes(query) ||
                (topic.id === article.family.id && visibleLabels.length)),
          )
          if (!zoneTopics.length) return null
          return (
            <details
              key={zone}
              open={zone === article.family.zoneSlug || Boolean(query)}
            >
              <summary className="cursor-pointer py-2 text-sm font-medium">
                {zoneTopics[0].zoneName}
              </summary>
              <div className="ml-2 space-y-2 border-l pl-2">
                {zoneTopics.map((topic) => {
                  const current = topic.id === article.family.id
                  const href = `/structures/${topic.zoneSlug}/${topic.slug}${topic.hasArticle ? "" : `/${topic.firstLabelSlug}`}`
                  if (!current)
                    return (
                      <div key={topic.id}>{link(href, topic.name, false)}</div>
                    )
                  return (
                    <div key={topic.id}>
                      {topic.hasArticle ? (
                        link(base, topic.name, !article.structureId)
                      ) : (
                        <p className="px-2 py-2 text-sm font-medium">
                          {topic.name}
                        </p>
                      )}
                      <details open>
                        <summary className="cursor-pointer px-2 py-2 text-xs text-muted-foreground">
                          Labels ({visibleLabels.length})
                        </summary>
                        <div className="ml-2 space-y-1 border-l pl-2">
                          {groups.map((group) => (
                            <details key={group} open>
                              <summary className="cursor-pointer px-2 py-2 text-xs font-medium">
                                {group}
                              </summary>
                              {visibleLabels
                                .filter(
                                  (label) =>
                                    (label.groupName ?? "Labels") === group,
                                )
                                .map((label) => (
                                  <div key={label.id}>
                                    {link(
                                      `${base}/${label.slug}`,
                                      label.title,
                                      label.id === article.structureId,
                                    )}
                                  </div>
                                ))}
                            </details>
                          ))}
                        </div>
                      </details>
                    </div>
                  )
                })}
              </div>
            </details>
          )
        })}
        {query &&
        !topics.some((topic) => topic.name.toLowerCase().includes(query)) &&
        !visibleLabels.length ? (
          <p className="px-2 text-sm text-muted-foreground">
            No matching structures.
          </p>
        ) : null}
      </div>
    </nav>
  )
}
