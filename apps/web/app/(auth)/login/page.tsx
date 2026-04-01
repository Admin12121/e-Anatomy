import { LoginForm } from "@/components/login-form"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const params = await searchParams
  const nextPath =
    params.next && params.next.startsWith("/") ? params.next : "/dashboard"

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-2">
        <LoginForm nextPath={nextPath} />
      </div>
    </div>
  )
}
