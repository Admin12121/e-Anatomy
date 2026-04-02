import { configureStore } from "@reduxjs/toolkit"

import { modulesApi } from "@/lib/store/services/modules-api"

export function makeStore() {
  return configureStore({
    reducer: {
      [modulesApi.reducerPath]: modulesApi.reducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(modulesApi.middleware),
  })
}

export type AppStore = ReturnType<typeof makeStore>
export type RootState = ReturnType<AppStore["getState"]>
export type AppDispatch = AppStore["dispatch"]
