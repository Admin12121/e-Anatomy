"use client"

import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react"

import type {
  CreateZoneModalityAssetInput,
  CreateZoneModalityInput,
  CreateZoneInput,
  UpdateZoneModalityAssetInput,
  UpdateZoneModalityInput,
  UpdateZoneInput,
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
  tagTypes: ["Zones", "ZoneModalities", "ZoneModalityAssets"],
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
    uploadZoneModality: builder.mutation<
      ZoneModality,
      {
        zoneId: string
        formData: FormData
      }
    >({
      invalidatesTags: (_result, _error, { zoneId }) => [
        { type: "ZoneModalities", id: `LIST:${zoneId}` },
      ],
      query: ({ zoneId, formData }) => ({
        url: `/playground/zones/${zoneId}/modalities/intake`,
        method: "POST",
        body: formData,
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
  }),
})

export const {
  useCreateZoneModalityAssetMutation,
  useCreateZoneMutation,
  useCreateZoneModalityMutation,
  useGetZoneDetailQuery,
  useGetZoneModalityAssetsQuery,
  useGetZoneModalitiesQuery,
  useGetZonesQuery,
  useUploadZoneModalityMutation,
  useUpdateZoneMutation,
  useUpdateZoneModalityAssetMutation,
  useUpdateZoneModalityMutation,
} = playgroundApi
