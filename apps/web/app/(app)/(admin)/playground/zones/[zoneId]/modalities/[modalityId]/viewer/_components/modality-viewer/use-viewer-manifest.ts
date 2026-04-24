"use client";

import { skipToken } from "@reduxjs/toolkit/query";
import { useEffect, useMemo, useState } from "react";

import { useGetPublicZoneModalityViewerManifestQuery } from "@/lib/store/services/public-playground-api";
import { useGetZoneModalityViewerManifestQuery } from "@/lib/store/services/playground-api";

import { isSliceAsset } from "./utils";

const ACTIVE_INGEST_STATUSES = new Set([
  "queued",
  "uploaded",
  "validating",
  "needs_review",
  "deriving",
]);

const TERMINAL_INGEST_STATUSES = new Set([
  "failed",
  "ready_for_edit",
  "cancelled",
]);

type UseViewerManifestInput = {
  modalityId: string;
  modalitySlug: string;
  readOnly: boolean;
  zoneId: string;
  zoneSlug: string;
};

export function useViewerManifest({
  modalityId,
  modalitySlug,
  readOnly,
  zoneId,
  zoneSlug,
}: UseViewerManifestInput) {
  const [viewerPollingIntervalMs, setViewerPollingIntervalMs] = useState(0);

  const adminViewerQuery = useGetZoneModalityViewerManifestQuery(
    readOnly
      ? skipToken
      : {
          zoneId,
          modalityId,
        },
    {
      pollingInterval: viewerPollingIntervalMs,
      refetchOnFocus: true,
      refetchOnMountOrArgChange: true,
      refetchOnReconnect: true,
    },
  );
  const publicViewerQuery = useGetPublicZoneModalityViewerManifestQuery(
    readOnly
      ? {
          modalitySlug,
          zoneSlug,
        }
      : skipToken,
    {
      pollingInterval: viewerPollingIntervalMs,
      refetchOnFocus: true,
      refetchOnMountOrArgChange: true,
      refetchOnReconnect: true,
    },
  );

  const query = readOnly ? publicViewerQuery : adminViewerQuery;
  const { data, error } = query;
  const ingestStatus = data?.ingestJob?.status;
  const hasSliceAssets = useMemo(
    () => data?.assets.some(isSliceAsset) ?? false,
    [data?.assets],
  );
  const shouldPollViewerData = useMemo(() => {
    if (!data || error) {
      return false;
    }

    if (ingestStatus && ACTIVE_INGEST_STATUSES.has(ingestStatus)) {
      return true;
    }

    if (!hasSliceAssets && data.modality.processingStatus === "processing") {
      return !ingestStatus || !TERMINAL_INGEST_STATUSES.has(ingestStatus);
    }

    return false;
  }, [data, error, hasSliceAssets, ingestStatus]);
  const ingestFailureMessage = useMemo(() => {
    if (!data || data.ingestJob?.status !== "failed") {
      return null;
    }

    return (
      data.ingestJob.errorMessage ??
      "Study intake failed before any slices were produced."
    );
  }, [data]);

  useEffect(() => {
    const nextInterval = shouldPollViewerData ? 2500 : 0;

    const timeoutId = window.setTimeout(() => {
      setViewerPollingIntervalMs((current) =>
        current === nextInterval ? current : nextInterval,
      );
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [shouldPollViewerData]);

  return {
    ...query,
    hasSliceAssets,
    ingestFailureMessage,
    shouldPollViewerData,
  };
}
