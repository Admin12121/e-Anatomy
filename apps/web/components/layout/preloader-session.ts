"use client";

const HOME_PRELOADER_SEEN_AT_KEY = "voxel-anatomy:home-preloader-seen-at";
export const HOME_PRELOADER_TTL_MS = 30 * 60 * 1000;

let hasVisitedNonRootClientRoute = false;

function getNavigationType() {
  const [navigationEntry] = performance.getEntriesByType(
    "navigation",
  ) as PerformanceNavigationTiming[];

  return navigationEntry?.type ?? null;
}

function getLastSeenAt() {
  try {
    const storedValue = window.sessionStorage.getItem(
      HOME_PRELOADER_SEEN_AT_KEY,
    );
    const timestamp = storedValue ? Number(storedValue) : Number.NaN;

    return Number.isFinite(timestamp) ? timestamp : null;
  } catch {
    return null;
  }
}

export function markHomePreloaderSeen(now = Date.now()) {
  try {
    window.sessionStorage.setItem(HOME_PRELOADER_SEEN_AT_KEY, String(now));
  } catch {
    // Storage restrictions must never block the public viewer.
  }
}

export function markNonRootClientRouteVisited(now = Date.now()) {
  hasVisitedNonRootClientRoute = true;
  markHomePreloaderSeen(now);
}

export function shouldRunHomePreloader(now = Date.now()) {
  if (hasVisitedNonRootClientRoute) {
    return false;
  }

  const navigationType = getNavigationType();

  if (navigationType === "back_forward") {
    return false;
  }

  if (navigationType === "reload") {
    return true;
  }

  const lastSeenAt = getLastSeenAt();

  return lastSeenAt === null || now - lastSeenAt >= HOME_PRELOADER_TTL_MS;
}
