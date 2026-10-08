export type ZoneAnchor = {
  x: number;
  y: number;
  z: number;
};

export type ZoneSummary = {
  id: string;
  slug: string;
  name: string;
  bodyView: string;
  anchor: ZoneAnchor;
};

export type ZoneListResponse = {
  total: number;
  items: ZoneSummary[];
};

export type PublicZoneSummary = Pick<
  ZoneSummary,
  "id" | "slug" | "name" | "bodyView" | "anchor"
>;

export type PublicZoneListResponse = {
  total: number;
  items: PublicZoneSummary[];
};

export type ZoneDetail = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  bodyView: string;
  anchor: ZoneAnchor;
  createdAt: string;
  updatedAt: string;
};

export type CreateZoneInput = {
  name: string;
  description?: string | null;
  bodyView?: string;
  anchor: ZoneAnchor;
};

export type UpdateZoneInput = {
  name: string;
  description?: string | null;
  bodyView?: string;
  anchor?: ZoneAnchor;
};

export type ModalityType =
  | "mri"
  | "mpr"
  | "ct"
  | "pet"
  | "ultrasound"
  | "xray"
  | "mra"
  | "mrv"
  | "angiography"
  | "cbct"
  | "illustration"
  | "photography"
  | "endoscopy"
  | "other";

export type ModalitySourceKind = "manual" | "zip" | "dicom_files" | "library";

export type ModalityProcessingStatus =
  | "draft"
  | "uploaded"
  | "processing"
  | "ready"
  | "failed";

export type ZoneModality = {
  id: string;
  familyId: string;
  slug: string;
  name: string;
  modalityType: ModalityType;
  weightingCode: ModalityWeightingCode | null;
  coverImageUrl: string | null;
  sourceKind: ModalitySourceKind;
  sourceLabel: string | null;
  sourceFileCount: number;
  processingStatus: ModalityProcessingStatus;
  ingestStatus: ModalityIngestJobStatus | null;
  ingestSummaryJson: Record<string, unknown> | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ZoneModalityFamily = {
  slug: string
  primaryModalityId: string | null
  id: string;
  name: string;
  modalityType: ModalityType;
  thumbnailUrl: string | null;
  notes: string | null;
  readyVariantCount: number;
  totalVariantCount: number;
  variants: ZoneModality[];
};

export type ModalityIngestJobStatus =
  | "uploaded"
  | "queued"
  | "validating"
  | "needs_review"
  | "deriving"
  | "failed"
  | "ready_for_edit"
  | "cancelled";

export type ModalityIngestJob = {
  id: string;
  modalityId: string;
  sourceKind: ModalitySourceKind;
  sourceLabel: string | null;
  sourceFileCount: number;
  status: ModalityIngestJobStatus;
  summaryJson: Record<string, unknown>;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ModalitySourceAsset = {
  id: string;
  modalityId: string;
  ingestJobId: string;
  assetRole: "source_bundle" | "source_file";
  originalFileName: string;
  relativePath: string | null;
  storageBackend: "local_disk";
  storageKey: string;
  checksum: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

export type ZoneModalityFamilyListResponse = {
  total: number;
  items: ZoneModalityFamily[];
};

export type PublicZoneModalitySummary = {
  id: string;
  slug: string;
  name: string;
  readyVariantCount: number;
  totalVariantCount: number;
};

export type PublicZoneModalityListResponse = {
  total: number;
  items: PublicZoneModalitySummary[];
};

export type CreateZoneModalityInput = {
  familyId?: string | null;
  name: string;
  modalityType: ModalityType;
  weightingCode?: ModalityWeightingCode | null;
  coverImageUrl?: string | null;
  sourceKind?: ModalitySourceKind;
  sourceLabel?: string | null;
  sourceFileCount?: number | null;
  processingStatus?: ModalityProcessingStatus;
  notes?: string | null;
};

export type UpdateZoneModalityInput = {
  name: string;
  modalityType: ModalityType;
  weightingCode?: ModalityWeightingCode | null;
  coverImageUrl?: string | null;
  sourceKind?: ModalitySourceKind;
  sourceLabel?: string | null;
  sourceFileCount?: number | null;
  processingStatus?: ModalityProcessingStatus;
  notes?: string | null;
};

export type UpdateZoneModalityFamilyVariantInput = {
  modalityId: string;
  weightingCode?: ModalityWeightingCode | null;
};

export type UpdateZoneModalityFamilyInput = {
  name: string;
  modalityType: ModalityType;
  thumbnailUrl?: string | null;
  notes?: string | null;
  variants: UpdateZoneModalityFamilyVariantInput[];
};

export type ModalityAssetKind =
  | "slice"
  | "derived_slice"
  | "cover"
  | "overview"
  | "reference";

export type ModalityWeightingCode =
  | "t1"
  | "t1_gado"
  | "t2"
  | "t2_star"
  | "pd"
  | "flair"
  | "adc"
  | "dwi"
  | "other";

export type ZoneModalityAsset = {
  id: string;
  label: string;
  assetKind: ModalityAssetKind;
  weightingCode: ModalityWeightingCode | null;
  imageUrl: string;
  thumbnailUrl: string | null;
  sortOrder: number;
  notes: string | null;
  ingestJobId: string | null;
  storageBackend: string | null;
  storageKey: string | null;
  checksum: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  sourceRelativePath: string | null;
  seriesUid: string | null;
  seriesLabel: string | null;
  instanceUid: string | null;
  sliceIndex: number | null;
  orientationCode: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ZoneModalityAtlasPage = {
  id: string;
  imageUrl: string;
  width: number;
  height: number;
  sliceCount: number;
};

export type ZoneModalityAtlasFrame = {
  assetId: string;
  atlasId: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ZoneModalityAssetListResponse = {
  total: number;
  items: ZoneModalityAsset[];
};

export type CreateZoneModalityAssetInput = {
  label: string;
  assetKind?: ModalityAssetKind | null;
  weightingCode?: ModalityWeightingCode | null;
  imageUrl: string;
  thumbnailUrl?: string | null;
  sortOrder?: number | null;
  notes?: string | null;
};

export type UpdateZoneModalityAssetInput = {
  label: string;
  assetKind?: ModalityAssetKind | null;
  weightingCode?: ModalityWeightingCode | null;
  imageUrl: string;
  thumbnailUrl?: string | null;
  sortOrder?: number | null;
  notes?: string | null;
};

export type DeleteZoneModalityAssetsInput = {
  assetIds: string[];
};

export type DeleteZoneModalityAssetsResponse = {
  requestedCount: number;
  deletedCount: number;
};

export type ReorderZoneModalityAssetInput = {
  assetId: string;
  sortOrder: number;
};

export type ReorderZoneModalityAssetsInput = {
  updates: ReorderZoneModalityAssetInput[];
};

export type ReorderZoneModalityAssetsResponse = {
  requestedCount: number;
  updatedCount: number;
};

export type ViewerAccessLevel = "free" | "subscription";

export type ViewerStructureGroup = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  iconName: string | null;
  thumbnailUrl: string | null;
  sortOrder: number;
  isDefaultVisible: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ViewerStructure = {
  id: string;
  groupId: string | null;
  slug: string;
  title: string;
  colorHex: string;
  latinName: string | null;
  shortDescription: string | null;
  longDescription: string | null;
  synonyms: string[];
  learningPoints: string[];
  accessLevel: ViewerAccessLevel;
  isPinnedDefault: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type ViewerAnnotationPoint = {
  x: number;
  y: number;
};

export type ViewerAnnotation = {
  id: string;
  assetId: string;
  structureId: string;
  titleOverride: string | null;
  colorHex: string | null;
  leaderColorHex: string | null;
  overlayColorHex: string | null;
  overlayOpacity: number;
  anchorX: number;
  anchorY: number;
  labelX: number;
  labelY: number;
  leaderBendX: number | null;
  leaderBendY: number | null;
  polygonPoints: ViewerAnnotationPoint[];
  note: string | null;
  isVisibleDefault: boolean;
  isTargetedDefault: boolean;
  isPracticeHidden: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type MprPlane = "axial" | "coronal" | "sagittal";

export type MprViewerPlaneSpec = {
  sliceCount: number;
  assetIds: string[];
};

export type MprViewerSpec = {
  schemaVersion: "mpr-1" | string;
  coordinateSystem: "DICOM_LPS" | string;
  volume: {
    dimensions: [number, number, number];
    spacing: [number, number, number];
    origin: [number, number, number];
    frameOfReferenceUid: string | null;
    sourceSeriesUid: string;
    sourceSliceCount: number;
  };
  excludedSlices?: Record<MprPlane, number[]>;
  planes: Record<MprPlane, MprViewerPlaneSpec>;
};

export type ZoneModalityViewerManifest = {
  zone: ZoneDetail;
  modality: ZoneModality;
  modalityVariants: ZoneModality[];
  ingestJob: ModalityIngestJob | null;
  sourceAssets: ModalitySourceAsset[];
  assets: ZoneModalityAsset[];
  atlases: ZoneModalityAtlasPage[];
  atlasFrames: ZoneModalityAtlasFrame[];
  viewerSchemaVersion: string | null;
  viewerSpec: MprViewerSpec | Record<string, unknown> | null;
  structureGroups: ViewerStructureGroup[];
  structures: ViewerStructure[];
  annotations: ViewerAnnotation[];
};

export type CreateViewerStructureGroupInput = {
  title: string;
  description?: string | null;
  iconName?: string | null;
  thumbnailUrl?: string | null;
  sortOrder?: number | null;
  isDefaultVisible?: boolean | null;
};

export type UpdateViewerStructureGroupInput = CreateViewerStructureGroupInput;

export type CreateViewerStructureInput = {
  groupId?: string | null;
  title: string;
  colorHex?: string | null;
  latinName?: string | null;
  shortDescription?: string | null;
  longDescription?: string | null;
  synonyms?: string[] | null;
  learningPoints?: string[] | null;
  accessLevel?: ViewerAccessLevel | null;
  isPinnedDefault?: boolean | null;
  sortOrder?: number | null;
};

export type UpdateViewerStructureInput = CreateViewerStructureInput;

export type CreateViewerAnnotationInput = {
  assetId: string;
  structureId: string;
  titleOverride?: string | null;
  colorHex?: string | null;
  leaderColorHex?: string | null;
  overlayColorHex?: string | null;
  overlayOpacity?: number | null;
  anchorX: number;
  anchorY: number;
  labelX: number;
  labelY: number;
  leaderBendX?: number | null;
  leaderBendY?: number | null;
  polygonPoints?: ViewerAnnotationPoint[] | null;
  note?: string | null;
  isVisibleDefault?: boolean | null;
  isTargetedDefault?: boolean | null;
  isPracticeHidden?: boolean | null;
  sortOrder?: number | null;
};

export type UpdateViewerAnnotationInput = CreateViewerAnnotationInput;
