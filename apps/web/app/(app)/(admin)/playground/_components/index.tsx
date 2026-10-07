"use client";

import dynamic from "next/dynamic";
import { skipToken } from "@reduxjs/toolkit/query";
import { LoaderCircleIcon } from "lucide-react";
import { useState } from "react";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/ui/frame";
import { Button } from "@/components/ui/button";
import { useGetZoneDetailQuery, useGetZonesQuery } from "@/lib/store/services/playground-api";
import { ZoneModalitiesManager } from "./zone-modalities-manager";

const AnatomyStage = dynamic(() => import("@/components/anatomy/anatomy-stage").then(m => m.AnatomyStage), { ssr: false });

/** All zones are canonical: editors only assign and manage modalities here. */
export function AnatomyPlayground() {
  const { data, isFetching, isError } = useGetZonesQuery();
  const zones = data?.items ?? [];
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const activeId = zones.some(zone => zone.id === selectedZoneId) ? selectedZoneId : null;
  const { data: selectedZone } = useGetZoneDetailQuery(activeId ?? skipToken);
  return (
    <div className="grid h-full min-h-0 gap-2 overflow-hidden xl:grid-cols-[minmax(0,1fr)_30rem]">
      <div className="relative min-h-0 overflow-hidden rounded-xl">
        <AnatomyStage backgroundColor="#141414" className="h-full w-full rounded-xl" showBackdrop={false}
          onZoneSelect={setSelectedZoneId} selectedZoneId={activeId}
          zones={zones.map(zone => ({ id: zone.id, name: zone.name, slug: zone.slug }))}/>
      </div>
      <aside className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain pr-1">
        <Frame className="shrink-0">
          <FrameHeader className="p-3"><FrameTitle>Seven predefined zones</FrameTitle></FrameHeader>
          <FramePanel className="flex flex-wrap gap-2 p-3">
            {isFetching && <span className="flex items-center gap-2 text-sm"><LoaderCircleIcon className="size-4 animate-spin"/>Loading zones…</span>}
            {isError && <p role="alert" className="text-sm text-destructive">Unable to load zones.</p>}
            {zones.map(zone => (
              <Button size="sm" key={zone.id} variant={zone.id === activeId ? "default" : "outline"} onClick={() => setSelectedZoneId(zone.id)}>{zone.name}</Button>
            ))}
            {!isFetching && !isError && zones.length === 0 && <p className="text-sm text-muted-foreground">No canonical zones are seeded. Run the fixed-zones database migration.</p>}
          </FramePanel>
        </Frame>
        {selectedZone && <Frame className="shrink-0"><FrameHeader><FrameTitle>{selectedZone.name}</FrameTitle></FrameHeader><FramePanel className="p-3 text-sm text-muted-foreground">Manage existing modalities and content below. Zone names and anatomy regions are fixed.</FramePanel></Frame>}
        {activeId && <ZoneModalitiesManager key={activeId} zoneId={activeId} />}
      </aside>
    </div>
  );
}
export default AnatomyPlayground;
