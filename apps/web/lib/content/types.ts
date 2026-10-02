export type ContentFamily = {
  id: string;
  slug: string;
  name: string;
  zoneId: string;
  zoneSlug: string;
  zoneName: string;
  primaryModalityId: string | null;
  viewerSlug: string | null;
  thumbnailUrl: string | null;
  modalityType: string;
};
export type ContentLabel = {
  id: string;
  slug: string;
  title: string;
  groupName: string | null;
  thumbnailUrl?: string | null;
  modalityId: string;
  modalityName: string;
  isPrimary: boolean;
  revision: number;
  publishedRevision: number | null;
};
export type ContentResource = {
  kind: "reference" | "image" | "video" | "link" | "model";
  title: string;
  url: string;
  caption: string;
};
export type ContentDocument = {
  id: string | null;
  summary: string;
  bodyJson: Record<string, unknown>[];
  legacyMarkdown: string | null;
  accessLevel: "free" | "subscription";
  revision: number;
  publishedRevision: number | null;
  publishedAt: string | null;
  resources: ContentResource[];
};
export type ContentWorkspace = {
  family: ContentFamily;
  labels: ContentLabel[];
};
export type ContentArticle = ContentWorkspace & {
  title: string;
  structureId: string | null;
  structureSlug: string | null;
  document: ContentDocument;
};
export type PublicContentTopic = {
  id: string;
  slug: string;
  name: string;
  zoneSlug: string;
  zoneName: string;
  hasArticle: boolean;
  firstLabelSlug: string | null;
  thumbnailUrl: string | null;
  labels: Pick<ContentLabel, "id" | "slug" | "title" | "thumbnailUrl">[];
};
