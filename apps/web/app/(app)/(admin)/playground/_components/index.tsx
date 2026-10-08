"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Frame } from "@/components/ui/frame";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useGetZonesQuery } from "@/lib/store/services/playground-api";
import { ZoneModalitiesManager } from "./zone-modalities-manager";

const AnatomyStage = dynamic(() => import("@/components/anatomy/anatomy-stage").then(m => m.AnatomyStage), { ssr: false });

/** All zones are canonical: editors only assign and manage modalities here. */
export function AnatomyPlayground() {
  const { data, isFetching, isError } = useGetZonesQuery();
  const zones = data?.items ?? [];
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const activeId = zones.some(zone => zone.id === selectedZoneId) ? selectedZoneId : null;
  return (
    <div className="grid h-full min-h-0 gap-2 overflow-hidden xl:grid-cols-[minmax(0,1fr)_30rem]">
      <div className="relative min-h-0 overflow-hidden rounded-xl">
        <AnatomyStage backgroundColor="#141414" className="h-full w-full rounded-xl" showBackdrop={false}
          onZoneSelect={setSelectedZoneId} selectedZoneId={activeId}
          zones={zones.map(zone => ({ id: zone.id, name: zone.name, slug: zone.slug }))}/>
      </div>
      <aside className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain pr-1">
        {/* Same list as the home page's Regions / Zone panel. */}
        <Frame className="w-full shrink-0">
          <Table>
            <TableHeader>
              <TableRow className="text-left"><TableHead>Regions / Zone</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {isFetching && !zones.length ? (
                <TableRow><TableCell className="text-left text-muted-foreground">Loading zones...</TableCell></TableRow>
              ) : isError ? (
                <TableRow><TableCell className="text-left text-destructive">Unable to load zones.</TableCell></TableRow>
              ) : zones.length === 0 ? (
                <TableRow><TableCell className="text-left text-muted-foreground">No zones are available yet.</TableCell></TableRow>
              ) : zones.map(zone => (
                <TableRow key={zone.id} className="cursor-pointer" tabIndex={0}
                  aria-selected={zone.id === activeId} data-state={zone.id === activeId ? "selected" : undefined}
                  onClick={() => setSelectedZoneId(zone.id)}
                  onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedZoneId(zone.id); } }}>
                  <TableCell className="text-left font-medium">{zone.name}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Frame>
        {activeId && <ZoneModalitiesManager key={activeId} zoneId={activeId} />}
      </aside>
    </div>
  );
}
export default AnatomyPlayground;
