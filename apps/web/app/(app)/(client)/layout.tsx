import LayoutProvider from "@/components/layout/provider"

export default function ClientLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return <LayoutProvider>{children}</LayoutProvider>
}
