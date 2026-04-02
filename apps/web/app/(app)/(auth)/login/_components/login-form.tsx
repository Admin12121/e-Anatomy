"use client"

import Image from "next/image"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Link } from "next-transition-router"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { CardContent } from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Frame } from "@/components/ui/frame"
import { Input } from "@/components/ui/input"
import {
  DEFAULT_AUTHENTICATED_REDIRECT,
  resolveAuthenticatedRedirectPath,
} from "@/lib/auth/access"
import { authClient } from "@/lib/auth-client"
import { cn } from "@/lib/utils"

type AuthMode = "signin" | "signup"

export function LoginForm({
  nextPath,
  className,
  ...props
}: React.ComponentProps<"div"> & { nextPath?: string }) {
  const router = useRouter()
  const nextUrl =
    nextPath && nextPath.startsWith("/")
      ? nextPath
      : DEFAULT_AUTHENTICATED_REDIRECT

  const [mode, setMode] = useState<AuthMode>("signin")
  const [pending, setPending] = useState(false)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  async function handleEmailAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)

    try {
      const result =
        mode === "signin"
          ? await authClient.signIn.email({
              email,
              password,
            })
          : await authClient.signUp.email({
              email,
              name,
              password,
            })

      if (result.error) {
        toast.error(
          result.error.message ||
            (mode === "signin" ? "Unable to sign in" : "Unable to create account"),
        )
        return
      }

      const destination = resolveAuthenticatedRedirectPath({
        hasApiAccountId: Boolean(result.data?.user.apiAccountId),
        nextPath: nextUrl,
        roleCode: result.data?.user.role,
      })

      if (mode === "signin") {
        toast.success("Login successful")
      } else {
        toast.success("Account created successfully")
      }
      router.push(destination)
      router.refresh()
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "Authentication failed"
      toast.error(message)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Frame className="border-none bg-white dark:bg-[#18181b] py-5">
        <div className="mb-5 text-center">
          <Link
            href="/"
            className="flex flex-col items-center gap-2 self-center font-medium text-3xl font-otis-display"
          >
            <div className="flex size-14 items-center justify-center rounded-md">
              <Image src="/logo.png" alt="Alert" height={500} width={500} />
            </div>
            E-Anatomy.
          </Link>
        </div>
        <CardContent>
          <form onSubmit={handleEmailAuth}>
            <FieldGroup>
              {mode === "signup" ? (
                <Field>
                  <FieldLabel htmlFor="name">Name</FieldLabel>
                  <Input
                    id="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Your name"
                    required
                    className="border-border"
                  />
                </Field>
              ) : null}
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="m@example.com"
                  required
                  className="border-border"
                />
              </Field>
              <Field>
                <div className="flex items-center">
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                </div>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="*************"
                  required
                  className="border-border"
                />
              </Field>
              <Field className="space-y-1">
                <Button type="submit" disabled={pending}>
                  {pending
                    ? "Please wait..."
                    : mode === "signin"
                      ? "Login"
                      : "Create account"}
                </Button>
                <FieldDescription className="text-center">
                  {mode === "signin" ? (
                    <>
                      Don&apos;t have an account?{" "}
                      <button
                        type="button"
                        className="underline-offset-4 hover:underline"
                        onClick={() => setMode("signup")}
                      >
                        Sign up
                      </button>
                    </>
                  ) : (
                    <>
                      Already have an account?{" "}
                      <button
                        type="button"
                        className="underline-offset-4 hover:underline"
                        onClick={() => setMode("signin")}
                      >
                        Sign in
                      </button>
                    </>
                  )}
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Frame>
      <FieldDescription className="px-6 text-center">
        By continuing, you agree to our Terms and Privacy Policy.
      </FieldDescription>
    </div>
  )
}
