export async function uploadThumbnail(file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/playground/uploads/thumbnail", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error("Unable to upload thumbnail.");
  }

  return ((await response.json()) as { url: string }).url;
}
