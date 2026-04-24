"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Link } from "next-transition-router";
import { RiGoogleFill } from "@remixicon/react";
import {
  ArrowLeft,
  BadgeCheck,
  Fingerprint,
  LoaderCircle,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { Frame } from "@/components/ui/frame";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import {
  createLoginRedirectPath,
  DEFAULT_AUTHENTICATED_REDIRECT,
  resolveAuthenticatedRedirectPath,
} from "@/lib/auth/access";
import { authClient } from "@/lib/auth-client";
import type { LoginDiscoveryResult } from "@/lib/auth/types";
import { cn } from "@/lib/utils";

type LoginStep = "identify" | "methods" | "reset-password" | "second-factor";

type SecondFactorMethod = "email" | "totp";

type AuthUserLike = {
  apiAccountId?: string | null;
  role?: string | null;
  twoFactorEnabled?: boolean | null;
};

type LoginFormProps = React.ComponentProps<"div"> & {
  googleConfigured?: boolean;
  initialDiscovery?: LoginDiscoveryResult;
  initialEmail?: string;
  initialStep?: LoginStep;
  nextPath?: string;
  resumeTwoFactorSession?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractAuthUser(data: unknown): AuthUserLike | null {
  if (!isRecord(data) || !isRecord(data.user)) {
    return null;
  }

  return data.user as AuthUserLike;
}

function hasTwoFactorRedirect(data: unknown) {
  return isRecord(data) && data.twoFactorRedirect === true;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (isRecord(error) && "message" in error && error.message) {
    return String(error.message);
  }

  return fallback;
}

function isTwoFactorEnabled(user: AuthUserLike | null) {
  return Boolean(user?.twoFactorEnabled);
}

function resolveDestination(nextPath: string, user: AuthUserLike | null) {
  return resolveAuthenticatedRedirectPath({
    hasApiAccountId: Boolean(user?.apiAccountId),
    nextPath,
    roleCode: user?.role ?? null,
  });
}

async function markSecondFactorVerified() {
  const response = await fetch("/api/auth/second-factor", {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Unable to finish second-factor verification.");
  }
}

async function clearSecondFactorVerification() {
  await fetch("/api/auth/second-factor", {
    method: "DELETE",
  });
}

export function LoginForm({
  nextPath,
  className,
  googleConfigured: googleConfiguredProp = false,
  initialDiscovery,
  initialEmail = "",
  initialStep = "identify",
  resumeTwoFactorSession = false,
  ...props
}: LoginFormProps) {
  const router = useRouter();
  const nextUrl =
    nextPath && nextPath.startsWith("/")
      ? nextPath
      : DEFAULT_AUTHENTICATED_REDIRECT;

  const [step, setStep] = useState<LoginStep>(initialStep);
  const [pending, setPending] = useState(false);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [resetPasswordCode, setResetPasswordCode] = useState("");
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [secondFactorMethod, setSecondFactorMethod] =
    useState<SecondFactorMethod | null>(null);
  const [discovery, setDiscovery] = useState<LoginDiscoveryResult | null>(
    initialDiscovery ?? null,
  );
  const [showAlternateMethods, setShowAlternateMethods] = useState(false);

  const googleConfigured =
    googleConfiguredProp || Boolean(discovery?.canUseGoogle);
  const mailDeliveryHint = useMemo(() => {
    if (discovery?.mailDeliveryConfigured) {
      return null;
    }

    return "Email codes fall back to the server console until SMTP is configured.";
  }, [discovery?.mailDeliveryConfigured]);

  function goToMethodChooser() {
    setPassword("");
    setResetPasswordCode("");
    setResetPasswordValue("");
    setSecondFactorMethod(null);
    setTwoFactorCode("");
    setShowAlternateMethods(false);
    setStep(discovery?.exists ? "methods" : "identify");
  }

  function goToIdentifyStep() {
    setPassword("");
    setResetPasswordCode("");
    setResetPasswordValue("");
    setSecondFactorMethod(null);
    setTwoFactorCode("");
    setShowAlternateMethods(false);
    setStep("identify");
  }

  async function handleLookup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);

    try {
      const response = await fetch(
        `/api/auth/login-options?email=${encodeURIComponent(email)}`,
      );

      const payload = (await response.json()) as
        | LoginDiscoveryResult
        | {
            error?: string;
          };

      if (!response.ok || !("exists" in payload)) {
        throw new Error(
          "error" in payload
            ? (payload.error ?? "Unable to check the account.")
            : "Unable to check the account.",
        );
      }

      setDiscovery(payload);
      setPassword("");
      setResetPasswordCode("");
      setResetPasswordValue("");
      setSecondFactorMethod(null);
      setTwoFactorCode("");
      setShowAlternateMethods(
        !payload.hasPassword &&
          (payload.hasPasskey ||
            (payload.twoFactorEnabled && payload.secondFactor.totp)),
      );

      if (!payload.exists) {
        setDiscovery(null);
        setEmail("");
        setStep("identify");
        toast.error("Account not found.");
        return;
      }

      setStep("methods");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to check the account.",
      );
    } finally {
      setPending(false);
    }
  }

  async function redirectAfterPrimaryAuth(user: AuthUserLike | null) {
    const destination = resolveDestination(nextUrl, user);

    if (isTwoFactorEnabled(user)) {
      router.push(createLoginRedirectPath(nextUrl));
      router.refresh();
      return;
    }

    router.push(destination);
    router.refresh();
  }

  async function handlePasswordSignIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await signInWithPassword();
  }

  async function signInWithPassword(
    preferredSecondFactorMethod: SecondFactorMethod | null = null,
  ) {
    setPending(true);

    try {
      const result = await authClient.signIn.email({
        email,
        password,
      });

      if (result.error) {
        toast.error(
          getErrorMessage(result.error, "Unable to sign in with password."),
        );
        return;
      }

      if (hasTwoFactorRedirect(result.data)) {
        setStep("second-factor");
        setSecondFactorMethod(preferredSecondFactorMethod);
        setTwoFactorCode("");
        toast.message(
          preferredSecondFactorMethod === "totp"
            ? "Enter the code from your authenticator app to continue."
            : "Finish the second-factor challenge to continue.",
        );
        return;
      }

      toast.success("Login successful.");
      await redirectAfterPrimaryAuth(extractAuthUser(result.data));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Authentication failed.",
      );
    } finally {
      setPending(false);
    }
  }

  async function startPasswordReset() {
    if (!discovery?.canUseEmailOtp) {
      toast.error("Password reset by email is not enabled.");
      return;
    }

    setPending(true);

    try {
      const result = await authClient.emailOtp.requestPasswordReset({
        email,
      });

      if (result.error) {
        toast.error(
          getErrorMessage(result.error, "Unable to send the reset code."),
        );
        return;
      }

      setResetPasswordCode("");
      setResetPasswordValue("");
      setStep("reset-password");
      toast.success("We sent a password reset code to your email.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to send code.",
      );
    } finally {
      setPending(false);
    }
  }

  async function handleResetPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);

    try {
      const result = await authClient.emailOtp.resetPassword({
        email,
        otp: resetPasswordCode,
        password: resetPasswordValue,
      });

      if (result.error) {
        toast.error(
          getErrorMessage(result.error, "Unable to reset the password."),
        );
        return;
      }

      setPassword("");
      setResetPasswordCode("");
      setResetPasswordValue("");
      setShowAlternateMethods(false);
      setStep("methods");
      toast.success("Password reset. Sign in with your new password.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to reset the password.",
      );
    } finally {
      setPending(false);
    }
  }

  async function continueToAuthenticatorApp() {
    if (!password) {
      toast.error("Enter your password first.");
      return;
    }

    await signInWithPassword("totp");
  }

  async function handlePasskeySignIn() {
    setPending(true);

    try {
      const result = await authClient.signIn.passkey();

      if (result.error) {
        toast.error(
          getErrorMessage(result.error, "Unable to sign in with passkey."),
        );
        return;
      }

      toast.success("Passkey sign-in successful.");
      await redirectAfterPrimaryAuth(extractAuthUser(result.data));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Passkey sign-in failed.",
      );
    } finally {
      setPending(false);
    }
  }

  async function handleGoogleSignIn() {
    if (!googleConfigured) {
      toast.error("Google sign-in is not configured yet.");
      return;
    }

    setPending(true);

    try {
      const result = await authClient.signIn.social({
        callbackURL: createLoginRedirectPath(nextUrl),
        provider: "google",
      });

      if (result.error) {
        toast.error(
          getErrorMessage(result.error, "Unable to start Google sign-in."),
        );
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to start Google sign-in.",
      );
    } finally {
      setPending(false);
    }
  }

  async function sendSecondFactorEmailCode() {
    setPending(true);

    try {
      const result = await authClient.twoFactor.sendOtp();

      if (result.error) {
        toast.error(
          getErrorMessage(
            result.error,
            "Unable to send the second-factor code.",
          ),
        );
        return;
      }

      setSecondFactorMethod("email");
      setTwoFactorCode("");
      toast.success("We sent your second-factor code.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to send code.",
      );
    } finally {
      setPending(false);
    }
  }

  async function verifySecondFactor(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!secondFactorMethod) {
      toast.error("Choose a second-factor method first.");
      return;
    }

    setPending(true);

    try {
      const result =
        secondFactorMethod === "email"
          ? await authClient.twoFactor.verifyOtp({
              code: twoFactorCode,
            })
          : await authClient.twoFactor.verifyTotp({
              code: twoFactorCode,
            });

      if (result.error) {
        toast.error(
          getErrorMessage(result.error, "Unable to verify the second factor."),
        );
        return;
      }

      await markSecondFactorVerified();
      toast.success("Second factor verified.");
      router.push(resolveDestination(nextUrl, extractAuthUser(result.data)));
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to finish second-factor verification.",
      );
    } finally {
      setPending(false);
    }
  }

  async function startOver() {
    setPending(true);

    try {
      await clearSecondFactorVerification();
      await authClient.signOut();
      setDiscovery(null);
      setEmail("");
      setPassword("");
      setResetPasswordCode("");
      setResetPasswordValue("");
      setSecondFactorMethod(null);
      setTwoFactorCode("");
      setShowAlternateMethods(false);
      setStep("identify");
      router.replace("/login");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  const canShowPassword = Boolean(discovery?.exists && discovery.hasPassword);
  const canShowPasskey = Boolean(discovery?.exists && discovery.hasPasskey);
  const canUsePasswordReset = Boolean(
    discovery?.exists && discovery.canUseEmailOtp,
  );
  const canShowEmailSecondFactor = Boolean(discovery?.secondFactor.emailOtp);
  const canShowTotpSecondFactor = Boolean(discovery?.secondFactor.totp);
  const canUseAuthenticatorApp = Boolean(
    canShowPassword && discovery?.twoFactorEnabled && canShowTotpSecondFactor,
  );
  const hasAlternateMethodChoices = canShowPasskey || canUseAuthenticatorApp;

  function renderGoogleButton(label = "Continue with Google") {
    return (
      <Button
        size={"xl"}
        type="button"
        disabled={pending}
        onClick={handleGoogleSignIn}
        className="w-full"
      >
        <RiGoogleFill />
        {label}
      </Button>
    );
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Frame className="border-none bg-white py-5 dark:bg-[#18181b]">
        <div className="text-center">
          <Link
            href="/"
            className="flex flex-col items-center gap-2 self-center font-otis-display text-3xl font-medium"
          >
            <div className="flex size-14 items-center justify-center rounded-md">
              <Image src="/logo.webp" alt="Anatomy" height={500} width={500} />
            </div>
            Voxel-Anatomy.
          </Link>
        </div>
        <CardContent>
          <div className="mb-5 space-y-1 text-center">
            <h1 className="font-heading text-lg tracking-tight">
              {step === "second-factor"
                ? "Verify your identity"
                : "Continue to your account"}
            </h1>
          </div>

          {step === "identify" ? (
            <div className="space-y-4">
              <div className="space-y-3">
                {renderGoogleButton("Google")}
                <FieldSeparator className="mt-1 *:data-[slot=field-separator-content]:bg-[#262629]">
                  Or continue with
                </FieldSeparator>
              </div>
              <form onSubmit={handleLookup}>
                <FieldGroup>
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
                  <Button type="submit" disabled={pending}>
                    {pending ? "Checking account..." : "Continue"}
                  </Button>
                </FieldGroup>
              </form>
            </div>
          ) : null}

          {step === "methods" ? (
            <div className="space-y-4">
              <div className="space-y-3">
                {renderGoogleButton("Google")}
                <FieldSeparator className="mt-1 *:data-[slot=field-separator-content]:bg-[#262629]">
                  Or continue with
                </FieldSeparator>
              </div>
              <Field className="relative">
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  className="border-border pr-10"
                  disabled
                />
                <BadgeCheck className="absolute right-3 bottom-3 size-4 text-blue-500" />
              </Field>
              {canShowPassword ? (
                <form onSubmit={handlePasswordSignIn}>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="password">Password</FieldLabel>
                      <Input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="Enter your password"
                        required
                        className="border-border"
                      />
                    </Field>
                    {hasAlternateMethodChoices ? (
                      <Button
                        type="button"
                        variant="outline"
                        size={"xl"}
                        className="w-full"
                        disabled={pending}
                        onClick={() =>
                          setShowAlternateMethods((current) => !current)
                        }
                      >
                        {showAlternateMethods
                          ? "Hide other ways"
                          : "Try another way"}
                      </Button>
                    ) : canUsePasswordReset ? (
                      <Button
                        type="button"
                        variant="link"
                        className="h-auto justify-start px-0"
                        disabled={pending}
                        onClick={startPasswordReset}
                      >
                        Forgot your password?
                      </Button>
                    ) : null}
                    <Button
                      type="submit"
                      disabled={pending || password.length === 0}
                    >
                      {pending ? "Signing in..." : "Login"}
                    </Button>
                  </FieldGroup>
                </form>
              ) : null}
              {showAlternateMethods ? (
                <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
                  <p className="text-sm font-medium">Other ways to continue</p>
                  <div className="flex flex-col gap-2">
                    {canShowPasskey ? (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={pending}
                        onClick={handlePasskeySignIn}
                      >
                        <Fingerprint />
                        Continue with passkey
                      </Button>
                    ) : null}
                    {canUseAuthenticatorApp ? (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={pending || password.length === 0}
                        onClick={continueToAuthenticatorApp}
                      >
                        <ShieldCheck />
                        Continue to authenticator app
                      </Button>
                    ) : null}
                    {canUsePasswordReset ? (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={pending}
                        onClick={startPasswordReset}
                      >
                        <Mail />
                        Reset password with email code
                      </Button>
                    ) : null}
                  </div>
                  {mailDeliveryHint ? (
                    <FieldDescription>{mailDeliveryHint}</FieldDescription>
                  ) : null}
                </div>
              ) : null}
              <Button
                type="button"
                variant="link"
                className="w-full"
                onClick={goToIdentifyStep}
              >
                Back to email
              </Button>
            </div>
          ) : null}

          {step === "reset-password" ? (
            <form onSubmit={handleResetPassword}>
              <FieldGroup>
                <Field>
                  <FieldLabel>Password reset code</FieldLabel>
                  <InputOTP
                    maxLength={6}
                    value={resetPasswordCode}
                    onChange={setResetPasswordCode}
                  >
                    <InputOTPGroup>
                      {Array.from({ length: 6 }).map((_, index) => (
                        <InputOTPSlot key={index} index={index} />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                  <FieldDescription>
                    Enter the reset code we sent to {email}.
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="reset-password">New password</FieldLabel>
                  <Input
                    id="reset-password"
                    type="password"
                    value={resetPasswordValue}
                    onChange={(event) =>
                      setResetPasswordValue(event.target.value)
                    }
                    placeholder="Choose a new password"
                    required
                    className="border-border"
                  />
                </Field>
                {mailDeliveryHint ? (
                  <FieldDescription>{mailDeliveryHint}</FieldDescription>
                ) : null}
                <Button
                  type="submit"
                  disabled={
                    pending ||
                    resetPasswordCode.length < 6 ||
                    resetPasswordValue.length === 0
                  }
                >
                  {pending ? "Resetting..." : "Reset password"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={startPasswordReset}
                >
                  Resend code
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={goToMethodChooser}
                >
                  <ArrowLeft />
                  Back
                </Button>
              </FieldGroup>
            </form>
          ) : null}

          {step === "second-factor" ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-muted/40 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                    {pending ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <ShieldCheck />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      Second factor required
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Complete one more verification step to continue.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                {canShowEmailSecondFactor ? (
                  <Button
                    type="button"
                    variant={
                      secondFactorMethod === "email" ? "default" : "outline"
                    }
                    disabled={pending}
                    onClick={sendSecondFactorEmailCode}
                  >
                    <Mail />
                    Send email code
                  </Button>
                ) : null}
                {canShowTotpSecondFactor ? (
                  <Button
                    type="button"
                    variant={
                      secondFactorMethod === "totp" ? "default" : "outline"
                    }
                    disabled={pending}
                    onClick={() => {
                      setSecondFactorMethod("totp");
                      setTwoFactorCode("");
                    }}
                  >
                    <ShieldCheck />
                    Use authenticator app
                  </Button>
                ) : null}
              </div>

              {secondFactorMethod ? (
                <form onSubmit={verifySecondFactor}>
                  <FieldGroup>
                    <Field>
                      <FieldLabel>
                        {secondFactorMethod === "email"
                          ? "Email verification code"
                          : "Authenticator app code"}
                      </FieldLabel>
                      <InputOTP
                        maxLength={6}
                        value={twoFactorCode}
                        onChange={setTwoFactorCode}
                      >
                        <InputOTPGroup>
                          {Array.from({ length: 6 }).map((_, index) => (
                            <InputOTPSlot key={index} index={index} />
                          ))}
                        </InputOTPGroup>
                      </InputOTP>
                      <FieldDescription>
                        {secondFactorMethod === "email"
                          ? "Enter the latest code sent to your email."
                          : "Enter the current 6-digit code from your authenticator app."}
                      </FieldDescription>
                    </Field>
                    <Button
                      type="submit"
                      disabled={pending || twoFactorCode.length < 6}
                    >
                      {pending ? "Verifying..." : "Verify second factor"}
                    </Button>
                  </FieldGroup>
                </form>
              ) : null}

              {resumeTwoFactorSession ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  onClick={startOver}
                >
                  <ArrowLeft />
                  Sign out and use another account
                </Button>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Frame>
      <FieldDescription className="px-6 text-center">
        By continuing, you agree to our Terms and Privacy Policy.
      </FieldDescription>
    </div>
  );
}
