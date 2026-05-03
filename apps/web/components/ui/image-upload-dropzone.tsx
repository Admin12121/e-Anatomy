"use client";

import { useEffect, useRef } from "react";
import {
  AlertCircleIcon,
  ImageIcon,
  LoaderCircleIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";

import { useFileUpload } from "@/hooks/use-file-upload";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ImageUploadDropzoneProps = {
  accept?: string;
  className?: string;
  disabled?: boolean;
  dropzoneClassName?: string;
  emptyDescriptionClassName?: string;
  emptyDescription?: string;
  emptyTitleClassName?: string;
  emptyTitle?: string;
  maxSizeMB?: number;
  onClear?: () => void;
  onFileAccepted: (file: File) => void;
  previewAlt?: string;
  value?: string | null;
};

export function ImageUploadDropzone({
  accept = "image/svg+xml,image/png,image/jpeg,image/jpg,image/gif,image/webp,image/avif",
  className,
  disabled = false,
  dropzoneClassName,
  emptyDescription,
  emptyDescriptionClassName,
  emptyTitle = "Drop your image here",
  emptyTitleClassName,
  maxSizeMB = 8,
  onClear,
  onFileAccepted,
  previewAlt = "Uploaded image",
  value,
}: ImageUploadDropzoneProps) {
  const maxSize = maxSizeMB * 1024 * 1024;
  const [
    { files, isDragging, errors },
    {
      getInputProps,
      handleDragEnter,
      handleDragLeave,
      handleDragOver,
      handleDrop,
      openFileDialog,
      removeFile,
    },
  ] = useFileUpload({
    accept,
    maxSize,
  });
  const uploadedFile = files[0] ?? null;
  const previewUrl = uploadedFile?.preview || value || null;
  const handledFileIdRef = useRef<string | null>(null);
  const lastValueRef = useRef<string | null | undefined>(value);

  useEffect(() => {
    if (!uploadedFile || handledFileIdRef.current === uploadedFile.id) {
      return;
    }

    handledFileIdRef.current = uploadedFile.id;
    onFileAccepted(uploadedFile.file);
  }, [onFileAccepted, uploadedFile]);

  useEffect(() => {
    const hadSavedValue = Boolean(lastValueRef.current);
    lastValueRef.current = value;

    if (value || !hadSavedValue || !uploadedFile) {
      return;
    }

    removeFile(uploadedFile.id);
    handledFileIdRef.current = null;
  }, [removeFile, uploadedFile, value]);

  function handleRemove() {
    if (uploadedFile) {
      removeFile(uploadedFile.id);
      handledFileIdRef.current = null;
    }

    onClear?.();
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="relative">
        <div
          className={cn(
            "relative flex min-h-52 flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-input p-4 transition-colors",
            "has-[input:focus]:border-ring has-[input:focus]:ring-[3px] has-[input:focus]:ring-ring/50 data-[dragging=true]:bg-accent/50",
            disabled ? "pointer-events-none opacity-65" : null,
            dropzoneClassName,
          )}
          data-dragging={isDragging || undefined}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <input
            {...getInputProps()}
            aria-label="Upload image file"
            className="sr-only"
            disabled={disabled}
          />
          {previewUrl ? (
            <div className="absolute inset-0 flex items-center justify-center p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={uploadedFile?.file.name || previewAlt}
                className="mx-auto max-h-full rounded object-contain"
                src={previewUrl}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center px-4 py-3 text-center">
              <div
                aria-hidden="true"
                className="mb-2 flex size-11 shrink-0 items-center justify-center rounded-full border bg-background"
              >
                <ImageIcon className="size-4 opacity-60" />
              </div>
              <p className={cn("mb-1.5 text-sm font-medium", emptyTitleClassName)}>
                {emptyTitle}
              </p>
              <p className={cn("text-xs text-muted-foreground", emptyDescriptionClassName)}>
                {emptyDescription ??
                  `SVG, PNG, JPG, GIF, WebP or AVIF (max. ${maxSizeMB}MB)`}
              </p>
              <Button
                className="mt-4"
                disabled={disabled}
                onClick={openFileDialog}
                type="button"
                variant="outline"
              >
                {disabled ? (
                  <LoaderCircleIcon
                    aria-hidden="true"
                    className="-ms-1 size-4 animate-spin opacity-60"
                  />
                ) : (
                  <UploadIcon
                    aria-hidden="true"
                    className="-ms-1 size-4 opacity-60"
                  />
                )}
                Select image
              </Button>
            </div>
          )}
        </div>

        {previewUrl ? (
          <div className="absolute right-4 top-4">
            <button
              aria-label="Remove image"
              className="z-50 flex size-8 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white outline-none transition-[color,box-shadow] hover:bg-black/80 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              disabled={disabled}
              onClick={handleRemove}
              type="button"
            >
              <XIcon aria-hidden="true" className="size-4" />
            </button>
          </div>
        ) : null}
      </div>

      {errors.length > 0 ? (
        <div
          className="flex items-center gap-1 text-xs text-destructive"
          role="alert"
        >
          <AlertCircleIcon className="size-3 shrink-0" />
          <span>{errors[0]}</span>
        </div>
      ) : null}
    </div>
  );
}
