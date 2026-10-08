"use client";

import { useId, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  BrainIcon,
  ChevronRight,
  FileTextIcon,
  SearchIcon,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarProvider,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuAction,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import type { PublicContentTopic } from "@/lib/content/types";
import styles from "./public-article.module.css";

function Thumbnail({
  src,
  label = false,
}: {
  src?: string | null;
  label?: boolean;
}) {
  return src ? (
    <Image
      src={src}
      alt=""
      width={24}
      height={24}
      unoptimized
      className="size-6 shrink-0 rounded object-cover"
    />
  ) : label ? (
    <FileTextIcon aria-hidden="true" />
  ) : (
    <BrainIcon aria-hidden="true" />
  );
}

export function StructureTree({
  article,
  topics,
  collapsed = false,
}: {
  article: {
    family: { id: string };
    structureId: string | null;
    labels: PublicContentTopic["labels"];
  };
  topics: PublicContentTopic[];
  collapsed?: boolean;
}) {
  const searchId = useId();
  const [search, setSearch] = useState("");
  // Explicit open/closed choices; without one, the current family and every
  // search match start open.
  const [openChoice, setOpenChoice] = useState<Record<string, boolean>>({});
  const query = search.trim().toLowerCase();
  const setTopicOpen = (topicId: string, open: boolean) =>
    setOpenChoice((choices) => ({ ...choices, [topicId]: open }));
  const matches = (name: string) => name.toLowerCase().includes(query);
  const filtered = topics.filter(
    (topic) =>
      !query ||
      matches(topic.name) ||
      matches(topic.zoneName) ||
      topic.labels?.some((label) => matches(label.title)),
  );
  const zones = [...new Set(filtered.map((topic) => topic.zoneSlug))];
  return (
    <div
      aria-label="Anatomical structures"
      className={`${styles.navigation} min-w-0`}
      data-collapsed={collapsed}
    >
      <SidebarProvider
        keyboardShortcut={false}
        persistOpen={false}
        className="min-h-0! flex-col gap-5 bg-transparent!"
      >
        {/* Stays put while the list scrolls under it through a blurred fade. */}
        <div
          className={
            collapsed
              ? "hidden"
              : "sticky top-0 z-10 mb-2 bg-[var(--structure-nav-bg,#000061)]"
          }
        >
          <div className="relative">
            <label className="sr-only" htmlFor={searchId}>
              Search anatomical structures
            </label>
            <Input
              id={searchId}
              type="search"
              placeholder="Search structures…"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setOpenChoice({});
              }}
              className="h-8 rounded-sm border-0 bg-[#f2f2f2]! px-3 pr-9 font-['Rules_Variable','Arial_Narrow',sans-serif] text-sm text-[#000061]! uppercase shadow-none placeholder:text-[#000061]/70 [font-variation-settings:'wdth'_50] focus-visible:ring-2 focus-visible:ring-[#f2f2f2]/60"
            />
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute right-3 top-2 size-4 text-[#000061]"
            />
          </div>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-full h-10 bg-linear-to-b from-[var(--structure-nav-bg,#000061)] to-transparent backdrop-blur-sm [mask-image:linear-gradient(to_bottom,#000,transparent)]"
          />
        </div>
        {zones.map((zone) => (
          <SidebarGroup key={zone} className="p-0">
            <SidebarGroupLabel
              className={
                collapsed
                  ? "sr-only"
                  : "mb-2 h-auto px-0 text-xs text-inherit opacity-55"
              }
            >
              {filtered.find((topic) => topic.zoneSlug === zone)?.zoneName}
            </SidebarGroupLabel>
            <SidebarMenu className="gap-[7px]">
              {filtered
                .filter((topic) => topic.zoneSlug === zone)
                .map((topic) => {
                  const current = topic.id === article.family.id;
                  const base = `/structures/${topic.zoneSlug}/${topic.slug}`;
                  const labels =
                    topic.labels ?? (current ? article.labels : []);
                  const visible =
                    query && !matches(topic.name) && !matches(topic.zoneName)
                      ? labels.filter((label) => matches(label.title))
                      : labels;
                  const open =
                    openChoice[topic.id] ?? (current || Boolean(query));
                  const onOwnPage = current && !article.structureId;
                  return (
                    <Collapsible
                      key={topic.id}
                      asChild
                      open={open}
                      onOpenChange={(next) => setTopicOpen(topic.id, next)}
                      className="group/collapsible"
                    >
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          asChild
                          isActive={onOwnPage}
                          className={`${styles.navLink} h-8 gap-4 text-sm`}
                        >
                          <Link
                            href={base}
                            aria-current={onOwnPage ? "page" : undefined}
                            aria-expanded={visible.length ? open : undefined}
                            title={topic.name}
                            onClick={(event) => {
                              if (collapsed || !visible.length) return;
                              // Already on this page: the title toggles its
                              // labels. Elsewhere it navigates and opens them.
                              if (onOwnPage) {
                                event.preventDefault();
                                setTopicOpen(topic.id, !open);
                              } else {
                                setTopicOpen(topic.id, true);
                              }
                            }}
                          >
                            <Thumbnail src={topic.thumbnailUrl} />
                            <span>{topic.name}</span>
                            <span
                              className={styles.navRule}
                              aria-hidden="true"
                            />
                          </Link>
                        </SidebarMenuButton>
                        {!collapsed && visible.length ? (
                          <>
                            <CollapsibleTrigger asChild>
                              <SidebarMenuAction
                                type="button"
                                aria-label={`Toggle ${topic.name} labels`}
                                className={`${styles.navAction} right-0 top-1.5`}
                              >
                                <ChevronRight
                                  aria-hidden="true"
                                  className="transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90 motion-reduce:transition-none"
                                />
                              </SidebarMenuAction>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <SidebarMenuSub className="mx-0 mt-1 gap-[7px] border-0 pl-5">
                                {visible.map((label) => (
                                  <SidebarMenuSubItem key={label.id}>
                                    <SidebarMenuSubButton
                                      asChild
                                      isActive={
                                        label.id === article.structureId
                                      }
                                      className={`${styles.navLink} h-8 text-sm!`}
                                    >
                                      <Link
                                        href={`${base}/${label.slug}`}
                                        aria-current={
                                          label.id === article.structureId
                                            ? "page"
                                            : undefined
                                        }
                                        title={label.title}
                                      >
                                        <Thumbnail
                                          src={label.thumbnailUrl}
                                          label
                                        />
                                        <span>{label.title}</span>
                                        <span
                                          className={styles.navRule}
                                          aria-hidden="true"
                                        />
                                      </Link>
                                    </SidebarMenuSubButton>
                                  </SidebarMenuSubItem>
                                ))}
                              </SidebarMenuSub>
                            </CollapsibleContent>
                          </>
                        ) : null}
                      </SidebarMenuItem>
                    </Collapsible>
                  );
                })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
        {!filtered.length ? (
          <p className="text-xs normal-case opacity-70">
            No matching structures.
          </p>
        ) : null}
      </SidebarProvider>
    </div>
  );
}
