export type ZoneAnchor = {
  x: number
  y: number
  z: number
}

export type ZoneSummary = {
  id: string
  slug: string
  name: string
  bodyView: string
  anchor: ZoneAnchor
}

export type ZoneListResponse = {
  total: number
  items: ZoneSummary[]
}

export type ZoneDetail = {
  id: string
  slug: string
  name: string
  description: string | null
  bodyView: string
  anchor: ZoneAnchor
  createdAt: string
  updatedAt: string
}

export type CreateZoneInput = {
  name: string
  description?: string | null
  bodyView?: string
  anchor: ZoneAnchor
}

export type UpdateZoneInput = {
  name: string
  description?: string | null
  bodyView?: string
  anchor?: ZoneAnchor
}

export type ModalityType =
  | "mri"
  | "ct"
  | "mra"
  | "mrv"
  | "angiography"
  | "cbct"
  | "illustration"
  | "photography"
  | "endoscopy"
  | "other"

export type ModalitySourceKind = "manual" | "zip" | "dicom_files"

export type ModalityProcessingStatus =
  | "draft"
  | "uploaded"
  | "processing"
  | "ready"
  | "failed"

export type ZoneModality = {
  id: string
  name: string
  modalityType: ModalityType
  coverImageUrl: string | null
  sourceKind: ModalitySourceKind
  sourceLabel: string | null
  sourceFileCount: number
  processingStatus: ModalityProcessingStatus
  notes: string | null
  createdAt: string
  updatedAt: string
}

export type ModalityIngestJobStatus =
  | "uploaded"
  | "queued"
  | "validating"
  | "needs_review"
  | "deriving"
  | "failed"
  | "ready_for_edit"
  | "cancelled"

export type ModalityIngestJob = {
  id: string
  modalityId: string
  sourceKind: ModalitySourceKind
  sourceLabel: string | null
  sourceFileCount: number
  status: ModalityIngestJobStatus
  summaryJson: Record<string, unknown>
  errorMessage: string | null
  startedAt: string
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export type ModalitySourceAsset = {
  id: string
  modalityId: string
  ingestJobId: string
  assetRole: "source_bundle" | "source_file"
  originalFileName: string
  relativePath: string | null
  storageBackend: "local_disk"
  storageKey: string
  checksum: string
  mimeType: string
  sizeBytes: number
  createdAt: string
}

export type ZoneModalityListResponse = {
  total: number
  items: ZoneModality[]
}

export type CreateZoneModalityInput = {
  name: string
  modalityType: ModalityType
  coverImageUrl?: string | null
  sourceKind?: ModalitySourceKind
  sourceLabel?: string | null
  sourceFileCount?: number | null
  processingStatus?: ModalityProcessingStatus
  notes?: string | null
}

export type UpdateZoneModalityInput = {
  name: string
  modalityType: ModalityType
  coverImageUrl?: string | null
  sourceKind?: ModalitySourceKind
  sourceLabel?: string | null
  sourceFileCount?: number | null
  processingStatus?: ModalityProcessingStatus
  notes?: string | null
}

export type ModalityAssetKind =
  | "slice"
  | "derived_slice"
  | "cover"
  | "overview"
  | "reference"

export type ModalityWeightingCode =
  | "t1"
  | "t1_gado"
  | "t2"
  | "t2_star"
  | "flair"
  | "adc"
  | "dwi"
  | "other"

export type ZoneModalityAsset = {
  id: string
  label: string
  assetKind: ModalityAssetKind
  weightingCode: ModalityWeightingCode | null
  imageUrl: string
  thumbnailUrl: string | null
  sortOrder: number
  notes: string | null
  ingestJobId: string | null
  storageBackend: string | null
  storageKey: string | null
  checksum: string | null
  mimeType: string | null
  sizeBytes: number | null
  width: number | null
  height: number | null
  sourceRelativePath: string | null
  seriesUid: string | null
  seriesLabel: string | null
  instanceUid: string | null
  sliceIndex: number | null
  orientationCode: string | null
  createdAt: string
  updatedAt: string
}

export type ZoneModalityAssetListResponse = {
  total: number
  items: ZoneModalityAsset[]
}

export type CreateZoneModalityAssetInput = {
  label: string
  assetKind?: ModalityAssetKind | null
  weightingCode?: ModalityWeightingCode | null
  imageUrl: string
  thumbnailUrl?: string | null
  sortOrder?: number | null
  notes?: string | null
}

export type UpdateZoneModalityAssetInput = {
  label: string
  assetKind?: ModalityAssetKind | null
  weightingCode?: ModalityWeightingCode | null
  imageUrl: string
  thumbnailUrl?: string | null
  sortOrder?: number | null
  notes?: string | null
}

export type DeleteZoneModalityAssetsInput = {
  assetIds: string[]
}

export type DeleteZoneModalityAssetsResponse = {
  requestedCount: number
  deletedCount: number
}

export type ViewerAccessLevel = "free" | "subscription"

export type ViewerStructureGroup = {
  id: string
  slug: string
  title: string
  description: string | null
  colorHex: string
  iconName: string | null
  sortOrder: number
  isDefaultVisible: boolean
  createdAt: string
  updatedAt: string
}

export type ViewerStructure = {
  id: string
  groupId: string | null
  slug: string
  title: string
  latinName: string | null
  shortDescription: string | null
  longDescription: string | null
  synonyms: string[]
  learningPoints: string[]
  accessLevel: ViewerAccessLevel
  isPinnedDefault: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type ViewerAnnotationPoint = {
  x: number
  y: number
}

export type ViewerAnnotation = {
  id: string
  assetId: string
  structureId: string
  titleOverride: string | null
  colorHex: string | null
  leaderColorHex: string | null
  overlayColorHex: string | null
  overlayOpacity: number
  anchorX: number
  anchorY: number
  labelX: number
  labelY: number
  leaderBendX: number | null
  leaderBendY: number | null
  polygonPoints: ViewerAnnotationPoint[]
  note: string | null
  isVisibleDefault: boolean
  isTargetedDefault: boolean
  isPracticeHidden: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type ZoneModalityViewerManifest = {
  zone: ZoneDetail
  modality: ZoneModality
  ingestJob: ModalityIngestJob | null
  sourceAssets: ModalitySourceAsset[]
  assets: ZoneModalityAsset[]
  structureGroups: ViewerStructureGroup[]
  structures: ViewerStructure[]
  annotations: ViewerAnnotation[]
}

export type CreateViewerStructureGroupInput = {
  title: string
  description?: string | null
  colorHex?: string | null
  iconName?: string | null
  sortOrder?: number | null
  isDefaultVisible?: boolean | null
}

export type UpdateViewerStructureGroupInput = CreateViewerStructureGroupInput

export type CreateViewerStructureInput = {
  groupId?: string | null
  title: string
  latinName?: string | null
  shortDescription?: string | null
  longDescription?: string | null
  synonyms?: string[] | null
  learningPoints?: string[] | null
  accessLevel?: ViewerAccessLevel | null
  isPinnedDefault?: boolean | null
  sortOrder?: number | null
}

export type UpdateViewerStructureInput = CreateViewerStructureInput

export type CreateViewerAnnotationInput = {
  assetId: string
  structureId: string
  titleOverride?: string | null
  colorHex?: string | null
  leaderColorHex?: string | null
  overlayColorHex?: string | null
  overlayOpacity?: number | null
  anchorX: number
  anchorY: number
  labelX: number
  labelY: number
  leaderBendX?: number | null
  leaderBendY?: number | null
  polygonPoints?: ViewerAnnotationPoint[] | null
  note?: string | null
  isVisibleDefault?: boolean | null
  isTargetedDefault?: boolean | null
  isPracticeHidden?: boolean | null
  sortOrder?: number | null
}

export type UpdateViewerAnnotationInput = CreateViewerAnnotationInput
