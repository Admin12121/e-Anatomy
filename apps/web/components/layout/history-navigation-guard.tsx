"use client";

import { useEffect } from "react";

const ROOT_PATHNAME = "/";
export const ROOT_HISTORY_RESTORE_EVENT = "anatomy:root-history-restore";

export default function HistoryNavigationGuard() {
  useEffect(() => {
    const dispatchRootRestore = () => {
      if (window.location.pathname !== ROOT_PATHNAME) {
        return;
      }

      window.dispatchEvent(new CustomEvent(ROOT_HISTORY_RESTORE_EVENT));
    };

    const handlePopState = () => {
      window.setTimeout(() => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(dispatchRootRestore);
        });
      }, 0);
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) {
        return;
      }

      dispatchRootRestore();
    };

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  return null;
}
