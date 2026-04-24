"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type UploadedFile = {
  file: File;
  id: string;
  preview: string | null;
};

type UseFileUploadOptions = {
  accept?: string;
  maxFiles?: number;
  maxSize?: number;
};

type UseFileUploadState = {
  errors: string[];
  files: UploadedFile[];
  isDragging: boolean;
};

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function getAcceptedMatchers(accept: string | undefined) {
  return (accept ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function isFileAccepted(file: File, matchers: string[]) {
  if (matchers.length === 0) {
    return true;
  }

  const fileName = file.name.toLowerCase();
  const mimeType = file.type.toLowerCase();

  return matchers.some((matcher) => {
    if (matcher.endsWith("/*")) {
      return mimeType.startsWith(matcher.slice(0, -1));
    }

    if (matcher.startsWith(".")) {
      return fileName.endsWith(matcher);
    }

    return mimeType === matcher;
  });
}

export function useFileUpload({
  accept,
  maxFiles = 1,
  maxSize,
}: UseFileUploadOptions = {}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const acceptedMatchers = useMemo(() => getAcceptedMatchers(accept), [accept]);

  useEffect(() => {
    return () => {
      for (const file of files) {
        if (file.preview) {
          URL.revokeObjectURL(file.preview);
        }
      }
    };
  }, [files]);

  const addFiles = useCallback(
    (nextFiles: File[]) => {
      const nextErrors: string[] = [];
      const acceptedFiles: UploadedFile[] = [];

      for (const file of nextFiles.slice(0, maxFiles)) {
        if (!isFileAccepted(file, acceptedMatchers)) {
          nextErrors.push("Choose a supported image file.");
          continue;
        }

        if (typeof maxSize === "number" && file.size > maxSize) {
          nextErrors.push(`File must be ${formatBytes(maxSize)} or smaller.`);
          continue;
        }

        acceptedFiles.push({
          file,
          id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
          preview: file.type.startsWith("image/")
            ? URL.createObjectURL(file)
            : null,
        });
      }

      setFiles((current) => {
        for (const file of current) {
          if (file.preview) {
            URL.revokeObjectURL(file.preview);
          }
        }

        return acceptedFiles;
      });
      setErrors(nextErrors);
    },
    [acceptedMatchers, maxFiles, maxSize],
  );

  const handleDragEnter = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      dragDepthRef.current += 1;
      setIsDragging(true);
    },
    [],
  );

  const handleDragLeave = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);

      if (dragDepthRef.current === 0) {
        setIsDragging(false);
      }
    },
    [],
  );

  const handleDragOver = useCallback((event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      dragDepthRef.current = 0;
      setIsDragging(false);
      addFiles(Array.from(event.dataTransfer.files));
    },
    [addFiles],
  );

  const openFileDialog = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const removeFile = useCallback((fileId: string | undefined) => {
    if (!fileId) {
      return;
    }

    setFiles((current) => {
      const file = current.find((item) => item.id === fileId);

      if (file?.preview) {
        URL.revokeObjectURL(file.preview);
      }

      return current.filter((item) => item.id !== fileId);
    });
    setErrors([]);
  }, []);

  const getInputProps = useCallback(
    () => ({
      accept,
      multiple: maxFiles > 1,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
        addFiles(Array.from(event.target.files ?? []));
        event.target.value = "";
      },
      ref: inputRef,
      type: "file" as const,
    }),
    [accept, addFiles, maxFiles],
  );

  return [
    {
      errors,
      files,
      isDragging,
    },
    {
      getInputProps,
      handleDragEnter,
      handleDragLeave,
      handleDragOver,
      handleDrop,
      openFileDialog,
      removeFile,
    },
  ] as const satisfies readonly [
    UseFileUploadState,
    {
      getInputProps: () => React.ComponentProps<"input">;
      handleDragEnter: (event: React.DragEvent<HTMLElement>) => void;
      handleDragLeave: (event: React.DragEvent<HTMLElement>) => void;
      handleDragOver: (event: React.DragEvent<HTMLElement>) => void;
      handleDrop: (event: React.DragEvent<HTMLElement>) => void;
      openFileDialog: () => void;
      removeFile: (fileId: string | undefined) => void;
    },
  ];
}
