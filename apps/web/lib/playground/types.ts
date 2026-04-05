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

export type ModalityAssetKind = "slice" | "cover" | "overview" | "reference"

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
