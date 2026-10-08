import { LibraryManager } from "@/components/image-library/library-manager";
import { buildInternalAdminHeaders } from "@/lib/api/admin";
import { serverApiFetch } from "@/lib/api/server";
import { requireCapabilitySession } from "@/lib/auth/session";
import { imageLibraryApiPath, type LibraryStudy } from "@/lib/image-library/types";

export default async function ImageLibraryPage() {
  const { user } = await requireCapabilitySession("manage_content");
  const studies = await serverApiFetch<LibraryStudy[]>(imageLibraryApiPath(), {
    headers: buildInternalAdminHeaders(user), includeCookie: false, cache: "no-store",
  });
  return <LibraryManager initialStudies={studies} />;
}
