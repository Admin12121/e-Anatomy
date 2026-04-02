"use client"

import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react"

import type { ModuleListResponse } from "@/lib/auth/types"

export const modulesApi = createApi({
  reducerPath: "modulesApi",
  baseQuery: fetchBaseQuery({
    baseUrl: "/api",
    credentials: "include",
  }),
  tagTypes: ["Modules"],
  endpoints: (builder) => ({
    getModules: builder.query<ModuleListResponse, void>({
      providesTags: ["Modules"],
      query: () => "/modules",
    }),
  }),
})

export const { useGetModulesQuery } = modulesApi
