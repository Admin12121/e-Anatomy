import {
  Body,
  Container,
  Head,
  Html,
  Img,
  Preview,
  Tailwind,
} from "@react-email/components"
import type { ReactNode } from "react"

type EmailShellProps = {
  children: ReactNode
  company?: string
  logoUrl?: string
  preview: string
}

export function EmailShell({
  children,
  company = "Anatomy Platform",
  logoUrl,
  preview,
}: EmailShellProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Tailwind>
        <Body className="m-auto bg-[#030712] font-sans">
          <Container className="mx-auto my-10 max-w-[465px] rounded-2xl border border-[#243044] bg-[#111827] px-8 py-10">
            {logoUrl ? (
              <Img
                alt={`${company} logo`}
                className="mx-auto mb-8 mt-0"
                height="56"
                src={logoUrl}
                width="56"
              />
            ) : null}
            {children}
          </Container>
        </Body>
      </Tailwind>
    </Html>
  )
}
