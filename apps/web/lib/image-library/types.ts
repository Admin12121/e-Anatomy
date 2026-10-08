import type { ModalityType } from "@/lib/playground/types";

export type LibraryStudy = {
  id: string;
  name: string;
  modalityType: ModalityType;
  status: "queued" | "processing" | "editable" | "encoding" | "ready" | "failed";
  revision: number;
  sliceCount: number;
  progress: number;
  errorMessage: string | null;
};

export const MAX_LIBRARY_ZIP_BYTES = 1024 * 1024 * 1024;
export function imageLibraryApiPath(path: string[] = []) {
  return path.length ? `/image-library/${path.join("/")}` : "/image-library";
}
export function isLibraryBusy(study: LibraryStudy) {
  return ["queued", "processing", "encoding"].includes(study.status);
}

export async function readLibraryResponse<T>(response: Response): Promise<T> {
  let body: T & { error?: { message?: string } };
  try {
    body = await response.json();
  } catch {
    throw new Error("The image service returned an invalid response. Please try again.");
  }
  if (!body || typeof body !== "object") throw new Error("The image service returned an invalid response. Please try again.");
  if (!response.ok) throw new Error(body.error?.message || "Image library request failed.");
  return body;
}
