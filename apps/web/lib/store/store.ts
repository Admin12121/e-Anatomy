import { configureStore } from "@reduxjs/toolkit"

import { modulesApi } from "@/lib/store/services/modules-api"
import { playgroundApi } from "@/lib/store/services/playground-api"

export function makeStore() {
  return configureStore({
    reducer: {
      [modulesApi.reducerPath]: modulesApi.reducer,
      [playgroundApi.reducerPath]: playgroundApi.reducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(modulesApi.middleware, playgroundApi.middleware),
  })
}

export type AppStore = ReturnType<typeof makeStore>
export type RootState = ReturnType<AppStore["getState"]>
export type AppDispatch = AppStore["dispatch"]
