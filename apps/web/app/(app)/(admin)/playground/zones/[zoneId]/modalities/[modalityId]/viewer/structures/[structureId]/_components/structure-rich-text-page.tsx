"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import type { PartialBlock } from "@blocknote/core"
import { BlockNoteViewRaw, useCreateBlockNote } from "@blocknote/react"
import "@blocknote/core/fonts/inter.css"
import "@blocknote/react/style.css"
import { ArrowLeft, LoaderCircleIcon, SaveIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { ViewerAccessLevel } from "@/lib/playground/types"
import {
  useGetZoneModalityViewerManifestQuery,
  useUpdateViewerStructureMutation,
} from "@/lib/store/services/playground-api"

type StructureRichTextPageProps = {
  modalityId: string
  structureId: string
  zoneId: string
}

export function StructureRichTextPage({
  modalityId,
  structureId,
  zoneId,
}: StructureRichTextPageProps) {
  const viewerHref = `/playground/zones/${zoneId}/modalities/${modalityId}/viewer`
  const { data, error, isLoading } = useGetZoneModalityViewerManifestQuery(
    {
      zoneId,
      modalityId,
    },
    {
      refetchOnFocus: true,
      refetchOnReconnect: true,
    },
  )
  const [updateStructure, { isLoading: isSaving }] =
    useUpdateViewerStructureMutation()
  const structure = useMemo(
    () =>
      data?.structures.find((candidate) => candidate.id === structureId) ?? null,
    [data?.structures, structureId],
  )
  const initialBlocks = useMemo(
    () => toEditorBlocks(structure?.longDescription),
    [structure?.id, structure?.longDescription, structure?.updatedAt],
  )
  const editor = useCreateBlockNote(
    {
      initialContent: initialBlocks,
    },
    [initialBlocks],
  )

  const [titleDraft, setTitleDraft] = useState("")
  const [shortDescriptionDraft, setShortDescriptionDraft] = useState("")
  const [accessLevelDraft, setAccessLevelDraft] =
    useState<ViewerAccessLevel>("free")

  useEffect(() => {
    if (!structure) {
      return
    }

    setTitleDraft(structure.title)
    setShortDescriptionDraft(structure.shortDescription ?? "")
    setAccessLevelDraft(structure.accessLevel)
  }, [structure])

  async function handleSaveStructureDetail() {
    if (!structure) {
      return
    }

    if (!titleDraft.trim()) {
      toast.error("Topic title is required.")
      return
    }

    const longDescription = editor.blocksToMarkdownLossy(editor.document).trim()

    try {
      await updateStructure({
        zoneId,
        modalityId,
        structureId: structure.id,
        input: {
          title: titleDraft.trim(),
          groupId: structure.groupId ?? null,
          latinName: structure.latinName ?? null,
          shortDescription: shortDescriptionDraft.trim() || null,
          longDescription: longDescription || null,
          synonyms: structure.synonyms,
          learningPoints: structure.learningPoints,
          accessLevel: accessLevelDraft,
          isPinnedDefault: structure.isPinnedDefault,
          sortOrder: structure.sortOrder,
        },
      }).unwrap()

      toast.success("Topic detail saved.")
    } catch (mutationError) {
      toast.error(
        readMutationError(mutationError, "Unable to save topic detail."),
      )
    }
  }

  if (isLoading && !data) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center text-sm text-white/70">
        <LoaderCircleIcon className="mr-2 size-4 animate-spin" />
        Loading topic detail...
      </div>
    )
  }

  if (error || !structure) {
    return (
      <div className="space-y-4 rounded-2xl border border-white/10 bg-black/20 p-6 text-white">
        <p className="text-sm text-white/70">
          This topic could not be found. Return to the viewer and choose another
          topic.
        </p>
        <Button asChild type="button" variant="secondary">
          <Link href={viewerHref}>
            <ArrowLeft className="size-4" />
            Back to viewer
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-120px)] flex-col gap-4 p-2">
      <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
        <div className="flex items-center gap-3">
          <Button asChild size="sm" type="button" variant="secondary">
            <Link href={viewerHref}>
              <ArrowLeft className="size-4" />
              Back to viewer
            </Link>
          </Button>
          <div>
            <p className="text-sm font-semibold text-white">{structure.title}</p>
            <p className="text-xs text-white/50">
              Dedicated writing page for long-form learner notes.
            </p>
          </div>
        </div>
        <Button
          disabled={isSaving}
          type="button"
          onClick={handleSaveStructureDetail}
        >
          {isSaving ? (
            <LoaderCircleIcon className="size-4 animate-spin" />
          ) : (
            <SaveIcon className="size-4" />
          )}
          Save details
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <aside className="space-y-3 overflow-y-auto rounded-2xl border border-white/10 bg-black/20 p-4">
          <Input
            placeholder="Topic title"
            value={titleDraft}
            onChange={(event) => setTitleDraft(event.target.value)}
          />
          <select
            className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm"
            value={accessLevelDraft}
            onChange={(event) =>
              setAccessLevelDraft(event.target.value as ViewerAccessLevel)
            }
          >
            <option value="free">Open to all learners</option>
            <option value="subscription">Subscriber lesson</option>
          </select>
          <Textarea
            className="min-h-32"
            placeholder="Short summary shown in cards"
            value={shortDescriptionDraft}
            onChange={(event) => setShortDescriptionDraft(event.target.value)}
          />
          <div className="rounded-xl border border-dashed border-white/15 bg-black/25 p-3 text-xs text-white/60">
            Use the editor panel for full markdown-rich lesson writing. The
            saved content is mapped back into the topic long description.
          </div>
        </aside>

        <section
          className="project-rich-text rounded-2xl border border-white/10 bg-black/20"
          data-layout="workspace"
        >
          <BlockNoteViewRaw
            className="h-full"
            editor={editor}
            theme="dark"
            sideMenu={true}
          />
        </section>
      </div>
    </div>
  )
}

function toEditorBlocks(value: string | null | undefined): PartialBlock[] {
  const normalized = value?.trim()

  if (!normalized) {
    return [{ type: "paragraph", content: "" }]
  }

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)

  if (paragraphs.length === 0) {
    return [{ type: "paragraph", content: normalized }]
  }

  return paragraphs.map((paragraph) => ({
    type: "paragraph",
    content: paragraph,
  }))
}

function readMutationError(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null) {
    if ("data" in error && error.data && typeof error.data === "object") {
      const errorBody = error.data as { error?: { message?: string } }
      const message = errorBody.error?.message

      if (message) {
        return message
      }
    }

    if ("message" in error && typeof error.message === "string") {
      return error.message
    }
  }

  return fallback
}
