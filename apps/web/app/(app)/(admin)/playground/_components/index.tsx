"use client";

import dynamic from "next/dynamic";
import { skipToken } from "@reduxjs/toolkit/query";
import {
  LoaderCircleIcon,
  SaveIcon,
  Sparkle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { AnatomyStageZone } from "@/components/anatomy/anatomy-stage";
import { cn } from "@/lib/utils";
import type {
  UpdateZoneInput,
  ZoneAnchor,
  ZoneDetail,
  ZoneSummary,
} from "@/lib/playground/types";
import {
  useCreateZoneMutation,
  useGetZoneDetailQuery,
  useGetZonesQuery,
  useUpdateZoneMutation,
} from "@/lib/store/services/playground-api";
import { ZoneModalitiesManager } from "./zone-modalities-manager";
import {
  Frame,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/ui/frame";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Loader from "@/components/ui/loader";

const AnatomyStage = dynamic(
  () =>
    import("@/components/anatomy/anatomy-stage").then(
      (module) => module.AnatomyStage,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-xl w-full h-[calc(100vh-65px)] flex items-center justify-center bg-[#7e80fc] text-sm text-white/75">
        <Loader />
      </div>
    ),
  },
);

type EditorMode = "browse" | "create";
const EMPTY_ZONES: ZoneSummary[] = [];

export function AnatomyPlayground() {
  const { data: zonesResponse, isFetching: isZonesFetching } =
    useGetZonesQuery();
  const zones = zonesResponse?.items ?? EMPTY_ZONES;
  const stageZones: AnatomyStageZone[] = zones.map((zone) => ({
    id: zone.id,
    name: zone.name,
    anchor: zone.anchor,
  }));
  const [mode, setMode] = useState<EditorMode>("browse");
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [draftAnchor, setDraftAnchor] = useState<ZoneAnchor | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [createZone, { isLoading: isCreatingZone }] = useCreateZoneMutation();
  const [updateZone, { isLoading: isUpdatingZone }] = useUpdateZoneMutation();
  const activeSelectedZoneId =
    selectedZoneId && zones.some((zone) => zone.id === selectedZoneId)
      ? selectedZoneId
      : null;
  const { data: selectedZone, isFetching: isSelectedZoneFetching } = useGetZoneDetailQuery(
    activeSelectedZoneId ?? skipToken,
  );

  function getErrorMessage(error: unknown, fallback: string) {
    if (typeof error === "object" && error !== null) {
      if (
        "data" in error &&
        error.data &&
        typeof error.data === "object" &&
        "error" in error.data &&
        error.data.error &&
        typeof error.data.error === "object" &&
        "message" in error.data.error &&
        error.data.error.message
      ) {
        return String(error.data.error.message);
      }

      if ("message" in error && error.message) {
        return String(error.message);
      }
    }

    return fallback;
  }

  function resetCreateDraft() {
    setDraftAnchor(null);
    setDraftName("");
    setDraftDescription("");
  }

  function handleStartCreate() {
    setMode("create");
    setSelectedZoneId(null);
    resetCreateDraft();
  }

  function handleCancelCreate() {
    setMode("browse");
    resetCreateDraft();
  }

  function handleSelectZone(zoneId: string | null) {
    setSelectedZoneId(zoneId);
    setMode("browse");
    resetCreateDraft();
  }

  function handleCreateAnchor(anchor: ZoneAnchor) {
    setDraftAnchor(anchor);
    toast.message("Anchor placed. Name the zone and save it.");
  }

  async function handleCreateZone() {
    const name = draftName.trim();

    if (!draftAnchor) {
      toast.error("Pick an anchor on the 3D body first.");
      return;
    }

    if (!name) {
      toast.error("Zone name is required.");
      return;
    }

    try {
      const zone = await createZone({
        name,
        description: draftDescription.trim() || null,
        bodyView: "anterior",
        anchor: draftAnchor,
      }).unwrap();

      toast.success("Zone created.");
      setMode("browse");
      setSelectedZoneId(zone.id);
      resetCreateDraft();
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to create the zone."));
    }
  }

  async function handleSaveZoneChanges(
    zone: ZoneDetail,
    input: UpdateZoneInput,
  ) {
    try {
      await updateZone({
        zoneId: zone.id,
        input,
      }).unwrap();

      toast.success("Zone updated.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to update the zone."));
    }
  }

  return (
    <div className="grid h-full min-h-0 overflow-hidden gap-2 xl:grid-cols-[minmax(0,1fr)_30rem]">
      <div
        className={cn(
          "relative min-h-0 overflow-hidden rounded-xl",
          mode === "create" && "cursor-crosshair",
        )}
      >
        <AnatomyStage
          className={cn(
            "h-full w-full rounded-xl",
            mode === "create" && "cursor-crosshair",
          )}
          createMode={mode === "create"}
          draftAnchor={draftAnchor}
          onCreateAnchor={handleCreateAnchor}
          onZoneSelect={handleSelectZone}
          selectedZoneId={activeSelectedZoneId}
          zones={stageZones}
        />
      </div>

      <aside className="xl:sticky xl:top-0 flex h-full min-h-0 flex-col gap-3 self-start overflow-y-auto overscroll-contain pr-1">
        <div className="p-1">
          <Frame className="shrink-0 outline-offset-2 outline outline-border/50">
            <FrameHeader className="p-2 flex items-center justify-between flex-row">
              <FrameTitle>Zone Library</FrameTitle>
              <Button
                type="button"
                size="sm"
                disabled={isCreatingZone || isUpdatingZone || mode === "create"}
                onClick={handleStartCreate}
              >
                <Sparkle className="h-4 w-4 rounded-full bg-white fill-primary text-white" />
                Create zone
              </Button>
            </FrameHeader>
          </Frame>
        </div>

        <Frame className="shrink-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Zone</TableHead>
                <TableHead className="text-right">Body View</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isZonesFetching ? (
                <TableRow>
                  <TableCell colSpan={2} className="h-20">
                    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                      <LoaderCircleIcon className="size-4 animate-spin" />
                      Loading zones...
                    </div>
                  </TableCell>
                </TableRow>
              ) : zones.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={2}
                    className="h-20 text-center text-sm text-muted-foreground"
                  >
                    No zones are available yet.
                  </TableCell>
                </TableRow>
              ) : (
                zones.map((zone) => {
                  const isActive =
                    mode === "browse" && activeSelectedZoneId === zone.id;

                  return (
                    <TableRow
                      key={zone.id}
                      className="cursor-pointer"
                      data-state={isActive ? "selected" : undefined}
                      onClick={() => handleSelectZone(zone.id)}
                    >
                      <TableCell className="font-medium text-foreground">
                        {zone.name}
                      </TableCell>
                      <TableCell className="text-right capitalize text-muted-foreground">
                        {zone.bodyView}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Frame>

        {mode === "create" ? (
          <Frame className="shrink-0">
            <FrameHeader className="p-2">
              <FrameTitle>Create Zone</FrameTitle>
            </FrameHeader>
            <FramePanel>
              <FieldGroup className="gap-5">
                <Field>
                  <FieldLabel htmlFor="draft-zone-name">Zone name</FieldLabel>
                  <Input
                    id="draft-zone-name"
                    value={draftName}
                    onChange={(event) => setDraftName(event.target.value)}
                    placeholder="Brain, neck, chest, ear..."
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="draft-zone-description">
                    Internal notes
                  </FieldLabel>
                  <Textarea
                    id="draft-zone-description"
                    value={draftDescription}
                    onChange={(event) =>
                      setDraftDescription(event.target.value)
                    }
                    placeholder="Describe what this zone should contain."
                  />
                </Field>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    className="flex-1"
                    disabled={
                      !draftAnchor || !draftName.trim() || isCreatingZone
                    }
                    onClick={handleCreateZone}
                  >
                    {isCreatingZone ? (
                      <LoaderCircleIcon className="animate-spin" />
                    ) : (
                      <SaveIcon />
                    )}
                    Save zone
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isCreatingZone}
                    onClick={handleCancelCreate}
                  >
                    Cancel
                  </Button>
                </div>
              </FieldGroup>
            </FramePanel>
          </Frame>
        ) : mode === "browse" && activeSelectedZoneId ? (
          <Frame className="shrink-0">
            <FrameHeader className="p-2">
              <FrameTitle>Zone Details</FrameTitle>
            </FrameHeader>
            <FramePanel>
              {selectedZone?.id === activeSelectedZoneId ? (
                <ZoneDetailEditor
                  key={selectedZone.id}
                  pending={isUpdatingZone}
                  zone={selectedZone}
                  onSave={handleSaveZoneChanges}
                />
              ) : (
                <div className="flex h-20 items-center justify-center gap-2 text-sm text-muted-foreground">
                  {isSelectedZoneFetching ? (
                    <LoaderCircleIcon className="size-4 animate-spin" />
                  ) : null}
                  {isSelectedZoneFetching
                    ? "Loading zone details..."
                    : "Zone details are unavailable."}
                </div>
              )}
            </FramePanel>
          </Frame>
        ) : null}

        {mode === "browse" && activeSelectedZoneId ? (
          <ZoneModalitiesManager
            key={`zone-modalities-${activeSelectedZoneId}`}
            zoneId={activeSelectedZoneId}
          />
        ) : null}
      </aside>
    </div>
  );
}

export default AnatomyPlayground;

function ZoneDetailEditor({
  pending,
  zone,
  onSave,
}: {
  pending: boolean;
  zone: ZoneDetail;
  onSave: (zone: ZoneDetail, input: UpdateZoneInput) => Promise<void>;
}) {
  const [name, setName] = useState(zone.name);
  const [description, setDescription] = useState(zone.description ?? "");
  const hasChanges =
    name.trim() !== zone.name ||
    description.trim() !== (zone.description ?? "");

  async function handleSave() {
    const nextName = name.trim();

    if (!nextName) {
      toast.error("Zone name is required.");
      return;
    }

    await onSave(zone, {
      name: nextName,
      description: description.trim() || null,
      bodyView: zone.bodyView,
    });
  }

  return (
    <FieldGroup className="gap-5">
      <Field>
        <FieldLabel htmlFor="zone-name">Zone name</FieldLabel>
        <Input
          id="zone-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="zone-description">Internal notes</FieldLabel>
        <Textarea
          id="zone-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Add guidance for this zone."
        />
      </Field>

      <Button
        type="button"
        disabled={!hasChanges || pending}
        onClick={handleSave}
      >
        {pending ? <LoaderCircleIcon className="animate-spin" /> : <SaveIcon />}
        Save changes
      </Button>
    </FieldGroup>
  );
}
