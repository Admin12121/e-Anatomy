"use client";

import dynamic from "next/dynamic";
import { skipToken } from "@reduxjs/toolkit/query";
import {
  CrosshairIcon,
  LoaderCircleIcon,
  MapPinnedIcon,
  PlusIcon,
  SaveIcon,
  Sparkle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
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
import { ZoneCombobox } from "./zone-combobox";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/ui/frame";

const AnatomyStage = dynamic(
  () =>
    import("@/components/anatomy/anatomy-stage").then(
      (module) => module.AnatomyStage,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-xl w-full h-[calc(100vh-65px)] flex items-center justify-center bg-[#0a0b0d] text-sm text-white/75">
        Loading anatomy playground...
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
  const { data: selectedZone, isFetching: isZoneLoading } =
    useGetZoneDetailQuery(activeSelectedZoneId ?? skipToken);
  const hasEditableZone = mode === "browse" && Boolean(selectedZone);

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
    <div className="grid h-[calc(100vh-65px)] min-h-0 gap-2 xl:grid-cols-[minmax(0,1fr)_30rem]">
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

      <aside className="flex min-h-0 flex-col gap-3">
        <Frame>
          <FrameHeader>
            <FrameTitle>Zone Library</FrameTitle>
          </FrameHeader>
          <FramePanel className="space-y-4 pt-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="zone-selector">Select zone</FieldLabel>
                <ZoneCombobox
                  disabled={isZonesFetching || isCreatingZone || isUpdatingZone}
                  items={zones}
                  selectedZoneId={activeSelectedZoneId}
                  onSelect={handleSelectZone}
                />
              </Field>
            </FieldGroup>
            <FieldSeparator className="*:data-[slot=field-separator-content]:bg-[#262629] mt-1">
              Or
            </FieldSeparator>
            <FieldGroup className="mt-5">
              <Field>
                <Button
                  type="button"
                  size={"lg"}
                  className="shrink-0 w-full"
                  disabled={isCreatingZone || isUpdatingZone}
                  onClick={handleStartCreate}
                >
                  <Sparkle className="h-4 w-4 rounded-full bg-white fill-primary text-white" />
                  Create zone
                </Button>
              </Field>
            </FieldGroup>
          </FramePanel>
        </Frame>

        <Frame className="h-full">
          <FrameHeader>
            <FrameTitle>
              {mode === "create" ? "Create Zone" : "Zone Details"}
            </FrameTitle>
          </FrameHeader>
          <FramePanel className="h-full">
            {mode === "create" ? (
              <FieldGroup className="gap-5">
                <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-full bg-primary/10 p-2 text-primary">
                      <CrosshairIcon className="size-4" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">
                        {draftAnchor
                          ? "Anchor captured"
                          : "Waiting for anchor placement"}
                      </p>
                      <p className="text-xs leading-5 text-muted-foreground">
                        {draftAnchor
                          ? "You can save now or click a different position to replace the anchor."
                          : "Click anywhere on the body shell in the viewport to create a zone anchor."}
                      </p>
                    </div>
                  </div>
                </div>

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
            ) : hasEditableZone && selectedZone ? (
              <ZoneDetailEditor
                key={selectedZone.id}
                pending={isUpdatingZone}
                zone={selectedZone}
                onSave={handleSaveZoneChanges}
              />
            ) : (
              <div className="flex h-full min-h-[16rem] flex-col items-center justify-center rounded-lg border border-dashed border-border/80 bg-muted/20 px-6 text-center">
                {isZoneLoading ? (
                  <LoaderCircleIcon className="size-5 animate-spin text-muted-foreground" />
                ) : (
                  <MapPinnedIcon className="size-5 text-muted-foreground" />
                )}
                <p className="mt-3 text-sm font-medium text-foreground">
                  Select a zone to inspect it
                </p>
                <p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">
                  Choose an existing zone from the combobox or click a marker in
                  the 3D scene.
                </p>
              </div>
            )}
          </FramePanel>
        </Frame>
      </aside>
    </div>
  );
}

export default AnatomyPlayground;

function CoordinateBadge({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/80 bg-muted/20 px-3 py-2">
      <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-medium text-foreground">
        {value.toFixed(2)}
      </div>
    </div>
  );
}

function formatShortDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

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
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{zone.slug}</Badge>
        <Badge variant="secondary">{zone.bodyView}</Badge>
        <Badge variant="outline">
          Updated {formatShortDate(zone.updatedAt)}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <CoordinateBadge label="X" value={zone.anchor.x} />
        <CoordinateBadge label="Y" value={zone.anchor.y} />
        <CoordinateBadge label="Z" value={zone.anchor.z} />
      </div>

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

      <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
        Modalities and viewer assets now attach to this zone. Imaging canvas and
        labeling come next.
      </div>

      <Button
        type="button"
        disabled={!hasChanges || pending}
        onClick={handleSave}
      >
        {pending ? <LoaderCircleIcon className="animate-spin" /> : <SaveIcon />}
        Save changes
      </Button>

      <ZoneModalitiesManager zone={zone} />
    </FieldGroup>
  );
}
