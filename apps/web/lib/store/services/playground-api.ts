"use client"

import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react"

import type {
  CreateViewerAnnotationInput,
  CreateViewerStructureGroupInput,
  CreateViewerStructureInput,
  CreateZoneModalityAssetInput,
  CreateZoneModalityInput,
  CreateZoneInput,
  UpdateViewerAnnotationInput,
  UpdateViewerStructureGroupInput,
  UpdateViewerStructureInput,
  UpdateZoneModalityAssetInput,
  UpdateZoneModalityInput,
  UpdateZoneInput,
  ViewerAnnotation,
  ViewerStructure,
  ViewerStructureGroup,
  ZoneModalityViewerManifest,
  ZoneModalityAsset,
  ZoneModalityAssetListResponse,
  ZoneDetail,
  ZoneListResponse,
  ZoneModality,
  ZoneModalityListResponse,
} from "@/lib/playground/types"

export const playgroundApi = createApi({
  reducerPath: "playgroundApi",
  baseQuery: fetchBaseQuery({
    baseUrl: "/api",
    credentials: "include",
  }),
  tagTypes: ["Zones", "ZoneModalities", "ZoneModalityAssets", "ZoneViewer"],
  endpoints: (builder) => ({
    getZones: builder.query<ZoneListResponse, void>({
      providesTags: (result) =>
        result
          ? [
              { type: "Zones", id: "LIST" },
              ...result.items.map((item) => ({ type: "Zones" as const, id: item.id })),
            ]
          : [{ type: "Zones", id: "LIST" }],
      query: () => "/playground/zones",
    }),
    getZoneDetail: builder.query<ZoneDetail, string>({
      providesTags: (_result, _error, zoneId) => [{ type: "Zones", id: zoneId }],
      query: (zoneId) => `/playground/zones/${zoneId}`,
    }),
    createZone: builder.mutation<ZoneDetail, CreateZoneInput>({
      invalidatesTags: [{ type: "Zones", id: "LIST" }],
      query: (body) => ({
        url: "/playground/zones",
        method: "POST",
        body,
      }),
    }),
    updateZone: builder.mutation<
      ZoneDetail,
      {
        zoneId: string
        input: UpdateZoneInput
      }
    >({
      invalidatesTags: (_result, _error, { zoneId }) => [
        { type: "Zones", id: "LIST" },
        { type: "Zones", id: zoneId },
      ],
      query: ({ zoneId, input }) => ({
        url: `/playground/zones/${zoneId}`,
        method: "PATCH",
        body: input,
      }),
    }),
    getZoneModalities: builder.query<ZoneModalityListResponse, string>({
      providesTags: (result, _error, zoneId) =>
        result
          ? [
              { type: "ZoneModalities", id: `LIST:${zoneId}` },
              ...result.items.map((item) => ({
                type: "ZoneModalities" as const,
                id: item.id,
              })),
            ]
          : [{ type: "ZoneModalities", id: `LIST:${zoneId}` }],
      query: (zoneId) => `/playground/zones/${zoneId}/modalities`,
    }),
    createZoneModality: builder.mutation<
      ZoneModality,
      {
        zoneId: string
        input: CreateZoneModalityInput
      }
    >({
      invalidatesTags: (_result, _error, { zoneId }) => [
        { type: "ZoneModalities", id: `LIST:${zoneId}` },
      ],
      query: ({ zoneId, input }) => ({
        url: `/playground/zones/${zoneId}/modalities`,
        method: "POST",
        body: input,
      }),
    }),
    updateZoneModality: builder.mutation<
      ZoneModality,
      {
        zoneId: string
        modalityId: string
        input: UpdateZoneModalityInput
      }
    >({
      invalidatesTags: (_result, _error, { zoneId, modalityId }) => [
        { type: "ZoneModalities", id: `LIST:${zoneId}` },
        { type: "ZoneModalities", id: modalityId },
      ],
      query: ({ zoneId, modalityId, input }) => ({
        url: `/playground/zones/${zoneId}/modalities/${modalityId}`,
        method: "PATCH",
        body: input,
      }),
    }),
    getZoneModalityAssets: builder.query<
      ZoneModalityAssetListResponse,
      {
        zoneId: string
        modalityId: string
      }
    >({
      providesTags: (result, _error, { modalityId }) =>
        result
          ? [
              { type: "ZoneModalityAssets", id: `LIST:${modalityId}` },
              ...result.items.map((item) => ({
                type: "ZoneModalityAssets" as const,
                id: item.id,
              })),
            ]
          : [{ type: "ZoneModalityAssets", id: `LIST:${modalityId}` }],
      query: ({ zoneId, modalityId }) =>
        `/playground/zones/${zoneId}/modalities/${modalityId}/assets`,
    }),
    createZoneModalityAsset: builder.mutation<
      ZoneModalityAsset,
      {
        zoneId: string
        modalityId: string
        input: CreateZoneModalityAssetInput
      }
    >({
      invalidatesTags: (_result, _error, { modalityId }) => [
        { type: "ZoneModalityAssets", id: `LIST:${modalityId}` },
      ],
      query: ({ zoneId, modalityId, input }) => ({
        url: `/playground/zones/${zoneId}/modalities/${modalityId}/assets`,
        method: "POST",
        body: input,
      }),
    }),
    updateZoneModalityAsset: builder.mutation<
      ZoneModalityAsset,
      {
        zoneId: string
        modalityId: string
        assetId: string
        input: UpdateZoneModalityAssetInput
      }
    >({
      invalidatesTags: (_result, _error, { modalityId, assetId }) => [
        { type: "ZoneModalityAssets", id: `LIST:${modalityId}` },
        { type: "ZoneModalityAssets", id: assetId },
      ],
      query: ({ zoneId, modalityId, assetId, input }) => ({
        url: `/playground/zones/${zoneId}/modalities/${modalityId}/assets/${assetId}`,
        method: "PATCH",
        body: input,
      }),
    }),
    getZoneModalityViewerManifest: builder.query<
      ZoneModalityViewerManifest,
      {
        zoneId: string
        modalityId: string
      }
    >({
      providesTags: (_result, _error, { modalityId }) => [
        { type: "ZoneViewer", id: `VIEWER:${modalityId}` },
      ],
      query: ({ zoneId, modalityId }) =>
        `/playground/zones/${zoneId}/modalities/${modalityId}/viewer`,
    }),
    createViewerStructureGroup: builder.mutation<
      ViewerStructureGroup,
      {
        zoneId: string
        modalityId: string
        input: CreateViewerStructureGroupInput
      }
    >({
      invalidatesTags: (_result, _error, { modalityId }) => [
        { type: "ZoneViewer", id: `VIEWER:${modalityId}` },
      ],
      query: ({ zoneId, modalityId, input }) => ({
        url: `/playground/zones/${zoneId}/modalities/${modalityId}/viewer/structure-groups`,
        method: "POST",
        body: input,
      }),
    }),
    updateViewerStructureGroup: builder.mutation<
      ViewerStructureGroup,
      {
        zoneId: string
        modalityId: string
        groupId: string
        input: UpdateViewerStructureGroupInput
      }
    >({
      invalidatesTags: (_result, _error, { modalityId }) => [
        { type: "ZoneViewer", id: `VIEWER:${modalityId}` },
      ],
      query: ({ zoneId, modalityId, groupId, input }) => ({
        url: `/playground/zones/${zoneId}/modalities/${modalityId}/viewer/structure-groups/${groupId}`,
        method: "PATCH",
        body: input,
      }),
    }),
    createViewerStructure: builder.mutation<
      ViewerStructure,
      {
        zoneId: string
        modalityId: string
        input: CreateViewerStructureInput
      }
    >({
      invalidatesTags: (_result, _error, { modalityId }) => [
        { type: "ZoneViewer", id: `VIEWER:${modalityId}` },
      ],
      query: ({ zoneId, modalityId, input }) => ({
        url: `/playground/zones/${zoneId}/modalities/${modalityId}/viewer/structures`,
        method: "POST",
        body: input,
      }),
    }),
    updateViewerStructure: builder.mutation<
      ViewerStructure,
      {
        zoneId: string
        modalityId: string
        structureId: string
        input: UpdateViewerStructureInput
      }
    >({
      invalidatesTags: (_result, _error, { modalityId }) => [
        { type: "ZoneViewer", id: `VIEWER:${modalityId}` },
      ],
      query: ({ zoneId, modalityId, structureId, input }) => ({
        url: `/playground/zones/${zoneId}/modalities/${modalityId}/viewer/structures/${structureId}`,
        method: "PATCH",
        body: input,
      }),
    }),
    createViewerAnnotation: builder.mutation<
      ViewerAnnotation,
      {
        zoneId: string
        modalityId: string
        input: CreateViewerAnnotationInput
      }
    >({
      invalidatesTags: (_result, _error, { modalityId }) => [
        { type: "ZoneViewer", id: `VIEWER:${modalityId}` },
      ],
      query: ({ zoneId, modalityId, input }) => ({
        url: `/playground/zones/${zoneId}/modalities/${modalityId}/viewer/annotations`,
        method: "POST",
        body: input,
      }),
    }),
    updateViewerAnnotation: builder.mutation<
      ViewerAnnotation,
      {
        zoneId: string
        modalityId: string
        annotationId: string
        input: UpdateViewerAnnotationInput
      }
    >({
      invalidatesTags: (_result, _error, { modalityId }) => [
        { type: "ZoneViewer", id: `VIEWER:${modalityId}` },
      ],
      query: ({ zoneId, modalityId, annotationId, input }) => ({
        url: `/playground/zones/${zoneId}/modalities/${modalityId}/viewer/annotations/${annotationId}`,
        method: "PATCH",
        body: input,
      }),
    }),
  }),
})

export const {
  useCreateViewerAnnotationMutation,
  useCreateViewerStructureGroupMutation,
  useCreateViewerStructureMutation,
  useCreateZoneModalityAssetMutation,
  useCreateZoneMutation,
  useCreateZoneModalityMutation,
  useGetZoneModalityViewerManifestQuery,
  useGetZoneDetailQuery,
  useGetZoneModalityAssetsQuery,
  useGetZoneModalitiesQuery,
  useGetZonesQuery,
  useUpdateViewerAnnotationMutation,
  useUpdateViewerStructureGroupMutation,
  useUpdateViewerStructureMutation,
  useUpdateZoneMutation,
  useUpdateZoneModalityAssetMutation,
  useUpdateZoneModalityMutation,
} = playgroundApi
