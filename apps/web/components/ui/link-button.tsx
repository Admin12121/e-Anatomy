"use client"

import type { ComponentProps, ReactNode } from "react"
import Link from "next/link"

import { Button } from "@/components/ui/button"

type LinkButtonProps = Omit<
  ComponentProps<typeof Button>,
  "asChild" | "children"
> & {
  children: ReactNode
  href: string
}

export function LinkButton({ children, href, ...props }: LinkButtonProps) {
  return (
    <Button asChild {...props}>
      <Link href={href}>{children}</Link>
    </Button>
  )
}
