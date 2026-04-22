import LayoutProvider from "@/components/layout/provider"
import { StoreProvider } from "@/lib/store/provider"

export default function ClientLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <StoreProvider>
      <LayoutProvider>{children}</LayoutProvider>
    </StoreProvider>
  )
}
