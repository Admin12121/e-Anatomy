"use client";

import dynamic from "next/dynamic";

const AnatomyStage = dynamic(
  () => import("@/components/anatomy/anatomy-stage").then((module) => module.AnatomyStage),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-xl w-full h-[calc(100vh-65px)] flex items-center justify-center bg-[#0a0b0d] text-sm text-white/75">
        Loading anatomy playground...
      </div>
    ),
  },
);

export function AnatomyPlayground() {
  return (
    <div className="h-[calc(100vh-65px)] flex gap-3">
      <AnatomyStage className="rounded-xl w-full h-[calc(100vh-65px)]" />
      <div className="w-[400px] h-full"></div>
    </div>
  );
}

export default AnatomyPlayground;
