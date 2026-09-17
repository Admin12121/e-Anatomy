import type {
  ViewerAnnotation,
  ViewerStructure,
  ZoneModalityAsset,
} from "@/lib/playground/types";

export function structureMatchesSearch(
  structure: ViewerStructure,
  normalizedQuery: string,
) {
  return [
    structure.title,
    structure.latinName ?? "",
    structure.shortDescription ?? "",
    ...structure.synonyms,
  ]
    .join(" ")
    .toLowerCase()
    .includes(normalizedQuery);
}

export function buildStructureSearchHits({
  annotations,
  assetsById,
  query,
  structures,
}: {
  annotations: ViewerAnnotation[];
  assetsById: ReadonlyMap<string, ZoneModalityAsset>;
  query: string;
  structures: ViewerStructure[];
}) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return [];
  }

  const firstAnnotationByStructureId = new Map<string, ViewerAnnotation>();

  for (const annotation of annotations) {
    if (!firstAnnotationByStructureId.has(annotation.structureId)) {
      firstAnnotationByStructureId.set(annotation.structureId, annotation);
    }
  }

  return structures
    .filter((structure) => structureMatchesSearch(structure, normalizedQuery))
    .map((structure) => {
      const relatedAnnotation = firstAnnotationByStructureId.get(structure.id);
      const relatedAsset = relatedAnnotation
        ? assetsById.get(relatedAnnotation.assetId)
        : null;

      return {
        asset: relatedAsset ?? null,
        structure,
      };
    })
    .slice(0, 8);
}

export function filterVisibleAnnotations({
  annotations,
  query,
  selectedStructureId,
  structuresById,
  targetedLabeling,
  visibleGroupIds,
}: {
  annotations: ViewerAnnotation[];
  query: string;
  selectedStructureId: string | null;
  structuresById: ReadonlyMap<string, ViewerStructure>;
  targetedLabeling: boolean;
  visibleGroupIds: string[];
}) {
  const normalizedQuery = query.trim().toLowerCase();
  const visibleGroupIdSet = new Set(visibleGroupIds);

  return annotations.filter((annotation) => {
    const structure = structuresById.get(annotation.structureId);

    if (!structure) {
      return false;
    }

    if (structure.groupId && !visibleGroupIdSet.has(structure.groupId)) {
      return false;
    }

    if (
      targetedLabeling &&
      selectedStructureId &&
      structure.id !== selectedStructureId
    ) {
      return false;
    }

    return (
      !normalizedQuery || structureMatchesSearch(structure, normalizedQuery)
    );
  });
}
