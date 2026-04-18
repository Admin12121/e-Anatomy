export function formatWeightingLabel(value: string) {
  switch (value) {
    case "all":
      return "All";
    case "t1_gado":
      return "T1 Gado";
    case "t2_star":
      return "T2*";
    default:
      return value.toUpperCase();
  }
}

export function toColorInputValue(
  value: string | null | undefined,
  fallback: string,
) {
  const normalized = value?.trim() ?? "";

  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized : fallback;
}
