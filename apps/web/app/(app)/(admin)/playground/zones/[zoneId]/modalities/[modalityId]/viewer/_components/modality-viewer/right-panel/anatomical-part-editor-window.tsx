"use client";

import { useEffect, useRef, useState } from "react";
import { XIcon } from "lucide-react";

import { ProjectRichTextEditor } from "@/components/anatomy/project-rich-text";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  clampPartEditorRect,
  getDefaultPartEditorRect,
  getMaximizedPartEditorRect,
  getPartEditorViewportBounds,
  type PartEditorWindowRect,
} from "./shared";

type AnatomicalPartEditorWindowProps = {
  initialContent: string;
  partTitle: string;
  onClose: () => void;
  onLongDescriptionChange: (value: string) => void;
};

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

const VIEWPORT_MARGIN = 8;

export function AnatomicalPartEditorWindow({
  initialContent,
  partTitle,
  onClose,
  onLongDescriptionChange,
}: AnatomicalPartEditorWindowProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [windowRect, setWindowRect] = useState<PartEditorWindowRect>(() => {
    if (typeof window === "undefined") {
      return getDefaultPartEditorRect();
    }

    return clampPartEditorRect(getDefaultPartEditorRect());
  });
  const previousWindowRectRef = useRef<PartEditorWindowRect>(
    getDefaultPartEditorRect(),
  );
  const dragStateRef = useRef<{
    originX: number;
    originY: number;
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);
  const resizeStateRef = useRef<{
    height: number;
    pointerId: number;
    startX: number;
    startY: number;
    width: number;
  } | null>(null);
  const [editorDraft, setEditorDraft] = useState(initialContent);

  useEffect(() => {
    setEditorDraft(initialContent);
  }, [initialContent]);

  const persistEditorDraft = () => {
    onLongDescriptionChange(editorDraft.trim());
  };

  useEffect(() => {
    const syncWindowRectToViewport = () => {
      setWindowRect((current) =>
        isMaximized ? getMaximizedPartEditorRect() : clampPartEditorRect(current),
      );
    };

    syncWindowRectToViewport();
    window.addEventListener("resize", syncWindowRectToViewport);

    return () => {
      window.removeEventListener("resize", syncWindowRectToViewport);
    };
  }, [isMaximized]);

  const handleWindowClose = () => {
    persistEditorDraft();
    onClose();
  };

  const handleWindowMinimize = () => {
    persistEditorDraft();
    setIsMinimized(true);
  };

  const handleWindowMaximizeToggle = () => {
    if (isMaximized) {
      setWindowRect(clampPartEditorRect(previousWindowRectRef.current));
      setIsMaximized(false);
      return;
    }

    previousWindowRectRef.current = windowRect;
    setIsMaximized(true);
  };

  if (isMinimized) {
    return (
      <div className="pointer-events-auto fixed bottom-4 right-4 z-90">
        <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-black/85 p-2 shadow-2xl backdrop-blur-md">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setIsMinimized(false)}
          >
            Restore Editor
          </Button>
          <div className="max-w-52 truncate text-xs text-white/70">
            {partTitle.trim() || "New Anatomical Part"}
          </div>
          <Button
            type="button"
            size="icon"
            variant="secondary"
            onClick={handleWindowClose}
          >
            <XIcon className="size-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-90">
      <div
        className="pointer-events-auto absolute"
        style={{
          height: windowRect.height,
          left: windowRect.x,
          top: windowRect.y,
          width: windowRect.width,
        }}
      >
        <div className="relative flex h-full min-h-0 flex-col overflow-visible rounded-xl bg-[#1f1f1f]">
          <div
            className={cn(
              "flex h-8 shrink-0 select-none items-center gap-3 rounded-tl-xl rounded-tr-xl bg-[#151515] px-3",
              isMaximized ? "cursor-default" : "cursor-move",
            )}
            onPointerCancel={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
              dragStateRef.current = null;
            }}
            onPointerDown={(event) => {
              if (isMaximized) {
                return;
              }

              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              dragStateRef.current = {
                originX: windowRect.x,
                originY: windowRect.y,
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
              };
            }}
            onPointerMove={(event) => {
              const dragState = dragStateRef.current;

              if (!dragState || dragState.pointerId !== event.pointerId) {
                return;
              }

              const deltaX = event.clientX - dragState.startX;
              const deltaY = event.clientY - dragState.startY;
              const maxX = Math.max(
                VIEWPORT_MARGIN,
                window.innerWidth - windowRect.width - VIEWPORT_MARGIN,
              );
              const maxY = Math.max(
                VIEWPORT_MARGIN,
                window.innerHeight - windowRect.height - VIEWPORT_MARGIN,
              );

              setWindowRect((current) => ({
                ...current,
                x: clampNumber(dragState.originX + deltaX, VIEWPORT_MARGIN, maxX),
                y: clampNumber(dragState.originY + deltaY, VIEWPORT_MARGIN, maxY),
              }));
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
              dragStateRef.current = null;
            }}
          >
            <div className="flex shrink-0 items-center gap-2">
              <button
                aria-label="Close editor"
                type="button"
                className="size-3 cursor-pointer rounded-full border border-black/25 bg-[#ff5f57] transition hover:brightness-95"
                onClick={handleWindowClose}
                onPointerDown={(event) => event.stopPropagation()}
              />
              <button
                aria-label="Minimize editor"
                type="button"
                className="size-3 cursor-pointer rounded-full border border-black/25 bg-[#febc2e] transition hover:brightness-95"
                onClick={handleWindowMinimize}
                onPointerDown={(event) => event.stopPropagation()}
              />
              <button
                aria-label={isMaximized ? "Restore editor" : "Maximize editor"}
                type="button"
                className="size-3 cursor-pointer rounded-full border border-black/25 bg-[#28c840] transition hover:brightness-95"
                onClick={handleWindowMaximizeToggle}
                onPointerDown={(event) => event.stopPropagation()}
              />
            </div>

            <div className="min-w-0 flex-1">
              <div className="mx-auto max-w-lg rounded-md border border-white/10 bg-black/30 px-3 py-1 text-center">
                <span className="block truncate text-[11px] text-white/65">
                  {partTitle.trim() || "New Anatomical Part"}
                </span>
              </div>
            </div>

            <div className="h-3 w-13 shrink-0" />
          </div>

          <section className="project-rich-text min-h-0 bg-black/20">
            <ProjectRichTextEditor
              className="h-full"
              variant="workspace"
              title={partTitle.trim() || "New Anatomical Part"}
              value={editorDraft}
              onChange={(value: string) => {
                setEditorDraft(value);
                onLongDescriptionChange(value);
              }}
            />
          </section>
        </div>

        {!isMaximized ? (
          <div
            className="absolute bottom-2 right-2 z-30 size-4 cursor-se-resize rounded-sm border border-white/35 bg-black/40"
            onPointerCancel={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
              resizeStateRef.current = null;
            }}
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              resizeStateRef.current = {
                height: windowRect.height,
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                width: windowRect.width,
              };
            }}
            onPointerMove={(event) => {
              const resizeState = resizeStateRef.current;

              if (!resizeState || resizeState.pointerId !== event.pointerId) {
                return;
              }

              const widthDelta = event.clientX - resizeState.startX;
              const heightDelta = event.clientY - resizeState.startY;
              const bounds = getPartEditorViewportBounds();
              const maxWidth = Math.max(
                bounds.minWidth,
                window.innerWidth - windowRect.x - VIEWPORT_MARGIN,
              );
              const maxHeight = Math.max(
                bounds.minHeight,
                window.innerHeight - windowRect.y - VIEWPORT_MARGIN,
              );

              setWindowRect((current) => ({
                ...current,
                width: clampNumber(
                  resizeState.width + widthDelta,
                  bounds.minWidth,
                  maxWidth,
                ),
                height: clampNumber(
                  resizeState.height + heightDelta,
                  bounds.minHeight,
                  maxHeight,
                ),
              }));
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
              resizeStateRef.current = null;
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
