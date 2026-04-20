import type { ReactNode } from "react";

import { StoreProvider } from "@/lib/store/provider";

type PlaygroundLayoutProps = {
  children: ReactNode;
};

export default function PlaygroundLayout({
  children,
}: PlaygroundLayoutProps) {
  return <StoreProvider>{children}</StoreProvider>;
}
