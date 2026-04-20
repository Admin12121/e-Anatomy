import { configureStore } from "@reduxjs/toolkit"

import { playgroundApi } from "@/lib/store/services/playground-api"

export function makeStore() {
  return configureStore({
    reducer: {
      [playgroundApi.reducerPath]: playgroundApi.reducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(playgroundApi.middleware),
  })
}

export type AppStore = ReturnType<typeof makeStore>
export type RootState = ReturnType<AppStore["getState"]>
export type AppDispatch = AppStore["dispatch"]
