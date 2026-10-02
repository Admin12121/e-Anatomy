const LEGAL_ROUTES = new Set(["/terms", "/privacy", "/about"]);
const PUBLIC_STATIC_ROUTES = new Set([
  "/",
  "/account",
  "/login",
  ...LEGAL_ROUTES,
]);
const ADMIN_ROUTE_SEGMENTS = new Set([
  "analytics",
  "content",
  "dashboard",
  "playground",
  "settings",
  "users",
]);

function normalizeRoutePath(path: string | undefined) {
  if (!path) return null;
  const pathname = path.split(/[?#]/, 1)[0] || "/";
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

function isCanvasViewerRoute(path: string) {
  const segments = path.split("/").filter(Boolean);
  return segments.length === 2 && !ADMIN_ROUTE_SEGMENTS.has(segments[0] ?? "");
}

export function shouldAnimateRouteTransition(
  from: string | undefined,
  to: string | undefined,
) {
  const fromPath = normalizeRoutePath(from);
  const toPath = normalizeRoutePath(to);
  if (!fromPath || !toPath || fromPath === toPath) return false;

  const fromLegal = LEGAL_ROUTES.has(fromPath);
  const toLegal = LEGAL_ROUTES.has(toPath);
  if (fromLegal || toLegal) {
    return (fromPath === "/" && toLegal) || (fromLegal && toPath === "/");
  }

  const fromStructures = fromPath.startsWith("/structures/");
  const toStructures = toPath.startsWith("/structures/");
  // Structures is one persistent workspace: only crossing to Home or the
  // canvas viewer animates. Its labels and modalities never interrupt browsing.
  if (fromStructures || toStructures) {
    if (fromStructures && toStructures) return false;
    const otherPath = fromStructures ? toPath : fromPath;
    return otherPath === "/" || isCanvasViewerRoute(otherPath);
  }

  return (
    (PUBLIC_STATIC_ROUTES.has(fromPath) || isCanvasViewerRoute(fromPath)) &&
    (PUBLIC_STATIC_ROUTES.has(toPath) || isCanvasViewerRoute(toPath))
  );
}
