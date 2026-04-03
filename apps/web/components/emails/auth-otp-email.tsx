import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Tailwind,
  Text,
} from "@react-email/components"

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
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Tailwind>
        <Body className="m-auto bg-[#030712] font-sans">
          <Container className="mx-auto my-10 max-w-[465px] rounded-2xl border border-white/10 bg-[#111827] px-8 py-10">
            <Section className="mb-8">
              {logoUrl ? (
                <Img
                  src={logoUrl}
                  width="56"
                  height="56"
                  alt={`${company} logo`}
                  className="mx-auto my-0"
                />
              ) : null}
            </Section>
            <Heading className="m-0 text-center text-[28px] font-semibold text-white">
              {company}
            </Heading>
            <Text className="mb-0 mt-6 text-sm leading-6 text-slate-200">
              Use this one-time code to {actionLabel}.
            </Text>
            <Section className="my-8 rounded-2xl bg-black/30 px-6 py-5 text-center">
              <Text className="m-0 text-[34px] font-bold tracking-[0.45em] text-white">
                {otp}
              </Text>
            </Section>
            <Text className="m-0 text-sm leading-6 text-slate-300">
              This code was requested for {email}. If this was not you, you can
              ignore this email.
            </Text>
            <Hr className="my-8 border-white/10" />
            <Text className="m-0 text-xs leading-5 text-slate-400">
              For security, this code expires soon and should only be used once.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  )
}
