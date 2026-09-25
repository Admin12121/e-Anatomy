import type {
  ModalityType,
  ModalityWeightingCode,
} from "@/lib/playground/types";

export const MODALITY_TYPE_OPTIONS: Array<{
  label: string;
  value: ModalityType;
}> = [
  { label: "MRI", value: "mri" },
  { label: "MPR", value: "mpr" },
  { label: "CT", value: "ct" },
  { label: "PET", value: "pet" },
  { label: "Ultrasound", value: "ultrasound" },
  { label: "X-ray", value: "xray" },
  { label: "MRA", value: "mra" },
  { label: "MRV", value: "mrv" },
  { label: "Angiography", value: "angiography" },
  { label: "CBCT", value: "cbct" },
  { label: "Illustration", value: "illustration" },
  { label: "Photography", value: "photography" },
  { label: "Endoscopy", value: "endoscopy" },
  { label: "Other", value: "other" },
];

export type ModalityWeightingSelectValue = ModalityWeightingCode | "";

export const MODALITY_WEIGHTING_OPTIONS: Array<{
  label: string;
  value: ModalityWeightingSelectValue;
}> = [
  { label: "Not set", value: "" },
  { label: "T1", value: "t1" },
  { label: "T1 Gado", value: "t1_gado" },
  { label: "T2", value: "t2" },
  { label: "T2*", value: "t2_star" },
  { label: "PD", value: "pd" },
  { label: "FLAIR", value: "flair" },
  { label: "ADC", value: "adc" },
  { label: "DWI", value: "dwi" },
  { label: "Other", value: "other" },
];

const WEIGHTING_LABEL_BY_VALUE = new Map<string, string>(
  MODALITY_WEIGHTING_OPTIONS.map((option) => [option.value, option.label]),
);

export function formatModalityWeightingLabel(
  value: string | null | undefined,
) {
  if (value === "all") {
    return "All";
  }

  return WEIGHTING_LABEL_BY_VALUE.get(value ?? "") ?? String(value).toUpperCase();
}

export function isMriModalityType(
  value: ModalityType | string | null | undefined,
) {
  return value === "mri";
}
