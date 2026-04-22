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
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(dispatchRootRestore);
      });
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) {
        return;
      }

      dispatchRootRestore();
    };

    const handleUnload = () => {
      // Intentionally empty. Keeping an unload listener prevents BFCache
      // restores on browsers that would otherwise revive a GSAP-mutated page.
    };

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("unload", handleUnload);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("unload", handleUnload);
    };
  }, []);

  return null;
}
