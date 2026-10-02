/** The atlas opens a viewer; catalog cards open the explanatory structures page. */
export function modalityDestination(
  zoneSlug: string,
  modalitySlug: string,
  mode: "atlas" | "catalog",
) {
  const path = `${encodeURIComponent(zoneSlug)}/${encodeURIComponent(modalitySlug)}`;
  return mode === "catalog" ? `/structures/${path}` : `/${path}`;
}
