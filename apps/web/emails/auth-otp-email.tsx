import {
  Heading,
  Hr,
  Section,
  Text,
} from "@react-email/components"

import { EmailShell } from "@/emails/components/email-shell"

type AuthOtpEmailProps = {
  actionLabel: string
  company?: string
  email: string
  logoUrl?: string
  otp: string
}

export function AuthOtpEmail({
  actionLabel,
  company = "Anatomy Platform",
  email,
  logoUrl,
  otp,
}: AuthOtpEmailProps) {
  const previewText = `${otp} is your ${company} code`

  return (
    <EmailShell company={company} logoUrl={logoUrl} preview={previewText}>
      <Heading className="m-0 text-center text-[28px] font-semibold text-white">
        {company}
      </Heading>
      <Text className="mb-0 mt-6 text-sm leading-6 text-[#dbeafe]">
        Use this one-time code to {actionLabel}.
      </Text>
      <Section className="my-8 rounded-2xl bg-[#030712] px-6 py-5 text-center">
        <Text className="m-0 text-[34px] font-bold tracking-[0.45em] text-white">
          {otp}
        </Text>
      </Section>
      <Text className="m-0 text-sm leading-6 text-[#cbd5e1]">
        This code was requested for {email}. If this was not you, you can ignore
        this email.
      </Text>
      <Hr className="my-8 border-[#243044]" />
      <Text className="m-0 text-xs leading-5 text-[#94a3b8]">
        For security, this code expires soon and should only be used once.
      </Text>
    </EmailShell>
  )
}
