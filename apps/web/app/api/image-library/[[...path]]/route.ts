import { NextResponse } from "next/server";
import { buildInternalAdminHeaders } from "@/lib/api/admin";
import { buildApiUrl, INTERNAL_API_BASE_URL } from "@/lib/api/config";
import { ensureJsonMutationRequest, ensureMultipartMutationRequest, ensureTrustedMutationRequest } from "@/lib/api/request-guard";
import { requireApiCapability } from "@/lib/auth/session";
import { imageLibraryApiPath, MAX_LIBRARY_ZIP_BYTES } from "@/lib/image-library/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path?: string[] }> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function proxy(request: Request, context: Context) {
  const path = (await context.params).path ?? [];
  const valid = (path.length === 0 && request.method !== "DELETE") || (uuid.test(path[0]) && (
    (request.method === "GET" && (path.length === 1 || (path.length === 2 && path[1] === "png"))) ||
    (request.method === "POST" && path.length === 2 && ["edited", "attach"].includes(path[1])) ||
    (request.method === "DELETE" && path.length === 1)
  ));
  if (!valid) return NextResponse.json({ error: { message: "Not found." } }, { status: 404 });
  if (request.method === "DELETE") {
    const guard = ensureTrustedMutationRequest(request);
    if (guard) return guard;
  }
  if (request.method === "POST") {
    const guard = path[1] === "attach" ? ensureJsonMutationRequest(request) : ensureMultipartMutationRequest(request);
    if (guard) return guard;
    const size = Number(request.headers.get("content-length"));
    const limit = path[1] === "attach" ? 64 * 1024 : MAX_LIBRARY_ZIP_BYTES + 64 * 1024;
    if (size > limit) return NextResponse.json({ error: { message: "Upload is too large." } }, { status: 413 });
  }
  const actor = await requireApiCapability(request.headers, "manage_content");
  if (!actor) return NextResponse.json({ error: { message: "Image library access is not permitted." } }, { status: 403 });
  const headers = new Headers(buildInternalAdminHeaders(actor.user));
  if (request.method === "POST") headers.set("content-type", request.headers.get("content-type")!);
  try {
    // Forward the stream instead of buffering a DICOM ZIP in the web process.
    const init: RequestInit & { duplex?: "half" } = {
      method: request.method, headers, cache: "no-store", signal: request.signal,
    };
    if (request.method === "POST") { init.body = request.body; init.duplex = "half"; }
    const endpoint = imageLibraryApiPath(path);
    const response = await fetch(buildApiUrl(INTERNAL_API_BASE_URL, endpoint), init);
    const outputHeaders = new Headers({ "cache-control": "no-store", "x-content-type-options": "nosniff" });
    for (const name of ["content-type", "content-disposition"]) {
      const value = response.headers.get(name);
      if (value) outputHeaders.set(name, value);
    }
    return new Response(response.body, { status: response.status, headers: outputHeaders });
  } catch {
    return NextResponse.json({ error: { message: "The image service is unavailable. Please try again." } }, { status: 502 });
  }
}

export const GET = proxy;
export const POST = proxy;
export const DELETE = proxy;
