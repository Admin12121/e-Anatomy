import { configureStore } from "@reduxjs/toolkit"

import { playgroundApi } from "@/lib/store/services/playground-api"
import { publicPlaygroundApi } from "@/lib/store/services/public-playground-api"

export function makeStore() {
  return configureStore({
    reducer: {
      [playgroundApi.reducerPath]: playgroundApi.reducer,
      [publicPlaygroundApi.reducerPath]: publicPlaygroundApi.reducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(
        playgroundApi.middleware,
        publicPlaygroundApi.middleware,
      ),
  })
}

export type AppStore = ReturnType<typeof makeStore>
export type RootState = ReturnType<AppStore["getState"]>
export type AppDispatch = AppStore["dispatch"]
