"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { PortalLegalShell } from "@/app/(app)/(client)/_legal/portal-legal-shell";
import { CompactFooter } from "@/app/(app)/(client)/_components/footer";
import { PublicAccountMenu } from "@/components/account/public-account-menu";
import { authClient } from "@/lib/auth-client";
import type { ContentFamily, PublicContentTopic } from "@/lib/content/types";
import { StructureTree } from "./structure-tree";
import { ModalityPreviewCard } from "./modality-preview-card";
import { CompactAnatomyModel } from "./compact-anatomy-model";

const FamilyContext = createContext<((family: ContentFamily) => void) | null>(
  null,
);

/** Pages supply viewer metadata without owning or remounting the shared model. */
export function PublicArticleMetadata({
  family,
  canonical,
}: {
  family: ContentFamily;
  canonical: string;
}) {
  const registerFamily = useContext(FamilyContext);
  const pathname = usePathname();
  useEffect(() => {
    if (pathname === canonical) registerFamily?.(family);
  }, [canonical, family, pathname, registerFamily]);
  return null;
}

export function PublicArticleShell({
  topics,
  children,
}: {
  topics: PublicContentTopic[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [, , zoneSlug, contentSlug, structureSlug] = pathname
    .split("/")
    .map((segment) => decodeURIComponent(segment));
  const topic = topics.find(
    (item) => item.zoneSlug === zoneSlug && item.slug === contentSlug,
  );
  const [families, setFamilies] = useState<Record<string, ContentFamily>>({});
  const registerFamily = useCallback((family: ContentFamily) => {
    const key = `${family.zoneSlug}/${family.slug}`;
    setFamilies((current) => {
      const previous = current[key];
      if (
        previous?.id === family.id &&
        previous.viewerSlug === family.viewerSlug &&
        previous.name === family.name &&
        previous.thumbnailUrl === family.thumbnailUrl &&
        previous.modalityType === family.modalityType
      ) {
        return current;
      }
      return { ...current, [key]: family };
    });
  }, []);
  const family = families[`${zoneSlug}/${contentSlug}`];
  const selection = {
    family: { id: topic?.id ?? "" },
    structureId:
      topic?.labels?.find((label) => label.slug === structureSlug)?.id ?? null,
    labels: topic?.labels ?? [],
  };
  const { data: session } = authClient.useSession();
  return (
    <FamilyContext.Provider value={registerFamily}>
      <PortalLegalShell
        kind="terms"
        title="Structures"
        workspace={{
          path: pathname,
          navigation: (collapsed) => (
            <StructureTree
              article={selection}
              topics={topics}
              collapsed={collapsed}
            />
          ),
          headerActions: session ? <PublicAccountMenu /> : undefined,
          content: children,
          tools: (
            <div className="flex min-w-0 flex-col gap-4">
              {family?.viewerSlug ? (
                <ModalityPreviewCard
                  name={family.name}
                  modalityType={family.modalityType}
                  previewSrc={family.thumbnailUrl}
                  href={`/${family.zoneSlug}/${family.viewerSlug}`}
                  tone="theme"
                  linkLabel={`Open ${family.name} viewer`}
                />
              ) : null}
              <CompactAnatomyModel
                key="anatomy-model"
                contentSlug={contentSlug ?? ""}
              />
            </div>
          ),
          footer: <CompactFooter />,
        }}
      />
    </FamilyContext.Provider>
  );
}
