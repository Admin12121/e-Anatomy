"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function ContentLiveRefresh({ enabled }: { enabled: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;

    const intervalId = window.setInterval(() => {
      router.refresh();
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [enabled, router]);

  return null;
}
