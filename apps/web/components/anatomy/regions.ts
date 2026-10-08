/** The seven fixed body regions, in model order. Slugs match the zones' canonical slugs. */
export const FIXED_REGIONS = [
  { slug: "head", name: "Head" },
  { slug: "neck", name: "Neck" },
  { slug: "chest", name: "Chest" },
  { slug: "abdomen-pelvis", name: "Abdomen & Pelvis" },
  { slug: "upper-limbs", name: "Upper Limbs" },
  { slug: "lower-limbs", name: "Lower Limbs" },
  { slug: "backbone", name: "Spine" },
] as const;

export function regionName(slug: string | null | undefined) {
  return FIXED_REGIONS.find((region) => region.slug === slug)?.name ?? null;
}
