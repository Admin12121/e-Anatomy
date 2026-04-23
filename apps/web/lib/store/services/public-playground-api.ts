"use client";

import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

import type {
  PublicZoneListResponse,
  PublicZoneModalityListResponse,
  ZoneModalityViewerManifest,
} from "@/lib/playground/types";

export const publicPlaygroundApi = createApi({
  reducerPath: "publicPlaygroundApi",
  baseQuery: fetchBaseQuery({
    baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1",
  }),
  tagTypes: ["PublicZones", "PublicZoneModalities", "PublicZoneViewers"],
  endpoints: (builder) => ({
    getPublicZones: builder.query<PublicZoneListResponse, void>({
      providesTags: (result) =>
        result
          ? [
              { type: "PublicZones", id: "LIST" },
              ...result.items.map((item) => ({
                type: "PublicZones" as const,
                id: item.id,
              })),
            ]
          : [{ type: "PublicZones", id: "LIST" }],
      query: () => "/public/playground/zones",
    }),
    getPublicZoneModalities: builder.query<
      PublicZoneModalityListResponse,
      string
    >({
      providesTags: (result, _error, zoneId) =>
        result
          ? [
              { type: "PublicZoneModalities", id: `LIST:${zoneId}` },
              ...result.items.map((item) => ({
                type: "PublicZoneModalities" as const,
                id: item.id,
              })),
            ]
          : [{ type: "PublicZoneModalities", id: `LIST:${zoneId}` }],
      query: (zoneId) => `/public/playground/zones/${zoneId}/modalities`,
    }),
    getPublicZoneModalityViewerManifest: builder.query<
      ZoneModalityViewerManifest,
      {
        modalitySlug: string;
        zoneSlug: string;
      }
    >({
      providesTags: (_result, _error, { modalitySlug, zoneSlug }) => [
        {
          type: "PublicZoneViewers",
          id: `${zoneSlug}:${modalitySlug}`,
        },
      ],
      query: ({ modalitySlug, zoneSlug }) =>
        `/public/playground/zones/${zoneSlug}/modalities/${modalitySlug}/viewer`,
    }),
  }),
});

export const {
  useGetPublicZoneModalitiesQuery,
  useGetPublicZoneModalityViewerManifestQuery,
  useGetPublicZonesQuery,
} = publicPlaygroundApi;
