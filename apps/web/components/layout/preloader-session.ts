"use client";

let hasVisitedNonRootClientRoute = false;

export function markNonRootClientRouteVisited() {
  hasVisitedNonRootClientRoute = true;
}

export function shouldRunHomePreloader() {
  return !hasVisitedNonRootClientRoute;
}
