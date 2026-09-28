"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Fingerprint, KeyRound, Mail, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { authClient } from "@/lib/auth-client";
import {
  Frame,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/ui/frame";

type SetupPayload = {
  backupCodes: string[];
  totpURI: string;
};

type PasskeyListItem = {
  createdAt?: Date | string | null;
  deviceType: string;
  id: string;
  name?: string | null;
};

function getErrorMessage(error: unknown, fallback: string) {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    error.message
  ) {
    return String(error.message);
  }

  return fallback;
}

function extractTotpSecret(totpURI?: string | null) {
  if (!totpURI) {
    return null;
  }

  try {
    return new URL(totpURI).searchParams.get("secret");
  } catch {
    return null;
  }
}

async function markSecondFactorVerified() {
  const response = await fetch("/api/auth/second-factor", {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Unable to update the verified second-factor state.");
  }
}

export function SecuritySettingsPanel() {
  const router = useRouter();
  const sessionState = authClient.useSession();
  const passkeysState = authClient.useListPasskeys();

  const session = sessionState.data;
  const passkeys = (passkeysState.data ?? []) as PasskeyListItem[];
  const sessionEmail = session?.user.email ?? "";

  const [pending, setPending] = useState(false);
  const [passkeyName, setPasskeyName] = useState("");
  const [setupPassword, setSetupPassword] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [resetRequested, setResetRequested] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [setupPayload, setSetupPayload] = useState<SetupPayload | null>(null);
  const [setupMethod, setSetupMethod] = useState<"email" | "totp">("totp");
  const [setupCode, setSetupCode] = useState("");

  const totpSecret = useMemo(
    () => extractTotpSecret(setupPayload?.totpURI),
    [setupPayload?.totpURI],
  );

  async function refreshSecurityState() {
    await sessionState.refetch();
    await passkeysState.refetch();
    router.refresh();
  }

  async function handleChangePassword() {
    const trimmedCurrentPassword = currentPassword.trim();
    const trimmedNewPassword = newPassword.trim();
    const trimmedConfirmPassword = confirmPassword.trim();

    if (!trimmedCurrentPassword) {
      toast.error("Enter your current password.");
      return;
    }

    if (trimmedNewPassword.length < 8) {
      toast.error("Use a password with at least 8 characters.");
      return;
    }

    if (trimmedNewPassword !== trimmedConfirmPassword) {
      toast.error("New password and confirmation do not match.");
      return;
    }

    setPending(true);

    try {
      const result = await authClient.changePassword({
        currentPassword: trimmedCurrentPassword,
        newPassword: trimmedNewPassword,
        revokeOtherSessions: true,
      });

      if (result.error) {
        toast.error(
          getErrorMessage(result.error, "Unable to update the password."),
        );
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password updated. Other sessions were revoked.");
      await refreshSecurityState();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to update the password.",
      );
    } finally {
      setPending(false);
    }
  }

  async function requestPasswordResetCode() {
    if (!sessionEmail) {
      toast.error("Your session email is not available yet.");
      return;
    }

    setPending(true);

    try {
      const result = await authClient.emailOtp.requestPasswordReset({
        email: sessionEmail,
      });

      if (result.error) {
        toast.error(
          getErrorMessage(result.error, "Unable to send the reset code."),
        );
        return;
      }

      setResetRequested(true);
      setResetCode("");
      toast.success(`A reset code was sent to ${sessionEmail}.`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to send the reset code.",
      );
    } finally {
      setPending(false);
    }
  }

  async function handleResetPasswordWithCode() {
    const trimmedPassword = resetPasswordValue.trim();
    const trimmedCode = resetCode.trim();

    if (!sessionEmail) {
      toast.error("Your session email is not available yet.");
      return;
    }

    if (trimmedPassword.length < 8) {
      toast.error("Use a password with at least 8 characters.");
      return;
    }

    if (trimmedCode.length < 6) {
      toast.error("Enter the 6-digit reset code from your email.");
      return;
    }

    setPending(true);

    try {
      const result = await authClient.emailOtp.resetPassword({
        email: sessionEmail,
        otp: trimmedCode,
        password: trimmedPassword,
      });

      if (result.error) {
        toast.error(
          getErrorMessage(result.error, "Unable to reset the password."),
        );
        return;
      }

      setResetPasswordValue("");
      setResetCode("");
      setResetRequested(false);
      setResetDialogOpen(false);
      toast.success("Password reset completed.");
      await refreshSecurityState();
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

  async function handleAddPasskey() {
    setPending(true);

    try {
      const result = await authClient.passkey.addPasskey({
        name: passkeyName || undefined,
      });

      if (result.error) {
        toast.error(
          getErrorMessage(result.error, "Unable to register the passkey."),
        );
        return;
      }

      setPasskeyName("");
      toast.success("Passkey registered.");
      await refreshSecurityState();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to register the passkey.",
      );
    } finally {
      setPending(false);
    }
  }

  async function handleDeletePasskey(id: string) {
    setPending(true);

    try {
      const result = await authClient.passkey.deletePasskey({ id });

      if (result.error) {
        toast.error(
          getErrorMessage(result.error, "Unable to remove the passkey."),
        );
        return;
      }

      toast.success("Passkey removed.");
      await refreshSecurityState();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to remove the passkey.",
      );
    } finally {
      setPending(false);
    }
  }

  async function startTwoFactorSetup() {
    setPending(true);

    try {
      const result = await authClient.twoFactor.enable({
        password: setupPassword,
      });

      if (result.error) {
        toast.error(
          getErrorMessage(result.error, "Unable to start two-factor setup."),
        );
        return;
      }

      setSetupPayload({
        backupCodes: result.data.backupCodes,
        totpURI: result.data.totpURI,
      });
      setSetupCode("");
      setSetupMethod("totp");
      toast.success("Two-factor setup started.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to start two-factor setup.",
      );
    } finally {
      setPending(false);
    }
  }

  async function sendTwoFactorEmailCode() {
    setPending(true);

    try {
      const result = await authClient.twoFactor.sendOtp();

      if (result.error) {
        toast.error(
          getErrorMessage(result.error, "Unable to send the email code."),
        );
        return;
      }

      setSetupMethod("email");
      setSetupCode("");
      toast.success("We sent a verification code to your email.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to send the email code.",
      );
    } finally {
      setPending(false);
    }
  }

  async function verifyTwoFactorSetup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);

    try {
      const result =
        setupMethod === "email"
          ? await authClient.twoFactor.verifyOtp({
              code: setupCode,
            })
          : await authClient.twoFactor.verifyTotp({
              code: setupCode,
            });

      if (result.error) {
        toast.error(
          getErrorMessage(result.error, "Unable to verify the setup code."),
        );
        return;
      }

      await markSecondFactorVerified();
      setSetupPayload(null);
      setSetupPassword("");
      setSetupCode("");
      toast.success("Two-factor authentication enabled.");
      await refreshSecurityState();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to verify the setup code.",
      );
    } finally {
      setPending(false);
    }
  }

  async function disableTwoFactor() {
    setPending(true);

    try {
      const result = await authClient.twoFactor.disable({
        password: disablePassword,
      });

      if (result.error) {
        toast.error(
          getErrorMessage(result.error, "Unable to disable two-factor."),
        );
        return;
      }

      setDisablePassword("");
      toast.success("Two-factor authentication disabled.");
      await refreshSecurityState();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to disable two-factor.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <Frame>
        <FramePanel>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="current-password">
                Current password
              </FieldLabel>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                placeholder="Enter your current password"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="new-password">New password</FieldLabel>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="Use at least 8 characters"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="confirm-password">
                Confirm new password
              </FieldLabel>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Re-enter the new password"
              />
            </Field>
          </FieldGroup>
        </FramePanel>
        <FrameFooter className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          <Button
            type="button"
            className="w-full sm:w-auto"
            disabled={
              pending ||
              currentPassword.length === 0 ||
              newPassword.length === 0 ||
              confirmPassword.length === 0
            }
            onClick={handleChangePassword}
          >
            Update password
          </Button>
          <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="link"
                className="h-auto min-h-10 w-full justify-center whitespace-normal px-0 text-center sm:w-auto sm:text-left"
                disabled={pending || !sessionEmail}
              >
                Forgot your password?
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-0 ring-0 sm:max-w-lg">
              <Frame className="bg-popover">
                <FrameHeader className="pr-12">
                  <DialogTitle asChild>
                    <FrameTitle className="flex items-center gap-2">
                      <KeyRound className="size-4" />
                      Forgot Password
                    </FrameTitle>
                  </DialogTitle>
                  <DialogDescription>
                    Send a reset code to {sessionEmail || "your email"} and set
                    a new password.
                  </DialogDescription>
                </FrameHeader>
                <FramePanel>
                  <FieldGroup>
                    <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm">
                      <p className="font-medium">Reset with email code</p>
                      <p className="mt-1 text-muted-foreground">
                        We will send a one-time code to{" "}
                        <strong>{sessionEmail || "your email"}</strong>.
                      </p>
                    </div>

                    {resetRequested ? (
                      <>
                        <Field>
                          <FieldLabel>Reset code</FieldLabel>
                          <InputOTP
                            maxLength={6}
                            value={resetCode}
                            onChange={setResetCode}
                          >
                            <InputOTPGroup>
                              {Array.from({ length: 6 }).map((_, index) => (
                                <InputOTPSlot key={index} index={index} />
                              ))}
                            </InputOTPGroup>
                          </InputOTP>
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="reset-password-value">
                            New password
                          </FieldLabel>
                          <Input
                            id="reset-password-value"
                            type="password"
                            value={resetPasswordValue}
                            onChange={(event) =>
                              setResetPasswordValue(event.target.value)
                            }
                            placeholder="Set a new password"
                          />
                        </Field>
                      </>
                    ) : null}
                  </FieldGroup>
                </FramePanel>
                <FrameFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <DialogClose asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => {
                        setResetRequested(false);
                        setResetCode("");
                        setResetPasswordValue("");
                      }}
                    >
                      Cancel
                    </Button>
                  </DialogClose>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    {resetRequested ? (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={pending || !sessionEmail}
                        onClick={requestPasswordResetCode}
                      >
                        <Mail />
                        Resend code
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      disabled={
                        pending ||
                        !sessionEmail ||
                        (resetRequested &&
                          (resetCode.length < 6 ||
                            resetPasswordValue.length < 8))
                      }
                      onClick={
                        resetRequested
                          ? handleResetPasswordWithCode
                          : requestPasswordResetCode
                      }
                    >
                      {resetRequested ? "Reset password" : "Send reset code"}
                    </Button>
                  </div>
                </FrameFooter>
              </Frame>
            </DialogContent>
          </Dialog>
        </FrameFooter>
      </Frame>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Frame>
          <FramePanel className="space-y-6">
            <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm">
              <p className="font-medium">
                Status:{" "}
                {session?.user.twoFactorEnabled ? "Enabled" : "Not enabled"}
              </p>
              <p className="mt-1 text-muted-foreground">
                When enabled, admin routes require a completed second factor
                before access is granted.
              </p>
            </div>

            {!session?.user.twoFactorEnabled ? (
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="setup-password">
                    Current password
                  </FieldLabel>
                  <Input
                    id="setup-password"
                    type="password"
                    value={setupPassword}
                    onChange={(event) => setSetupPassword(event.target.value)}
                    placeholder="Enter your current password"
                  />
                  <FieldDescription>
                    Better Auth requires your password before generating the
                    authenticator secret and backup codes.
                  </FieldDescription>
                </Field>
                <Button
                  type="button"
                  disabled={pending || setupPassword.length === 0}
                  onClick={startTwoFactorSetup}
                >
                  Start two-factor setup
                </Button>
              </FieldGroup>
            ) : (
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="disable-password">
                    Password to disable 2FA
                  </FieldLabel>
                  <Input
                    id="disable-password"
                    type="password"
                    value={disablePassword}
                    onChange={(event) => setDisablePassword(event.target.value)}
                    placeholder="Enter your password"
                  />
                </Field>
                <Button
                  type="button"
                  variant="destructive-outline"
                  disabled={pending || disablePassword.length === 0}
                  onClick={disableTwoFactor}
                >
                  Disable two-factor
                </Button>
              </FieldGroup>
            )}

            {setupPayload ? (
              <div className="space-y-5 rounded-2xl border border-border bg-background/80 p-5">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Finish setup</p>
                  <p className="text-sm text-muted-foreground">
                    Use the authenticator secret below, or verify with an email
                    code if you prefer that second-factor path.
                  </p>
                </div>

                <div className="rounded-xl border border-border bg-muted/40 p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
                    Authenticator secret
                  </p>
                  <p className="mt-2 break-all font-mono text-sm">
                    {totpSecret}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    URI: {setupPayload.totpURI}
                  </p>
                </div>

                <div className="rounded-xl border border-border bg-muted/40 p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
                    Backup codes
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {setupPayload.backupCodes.map((code) => (
                      <div
                        key={code}
                        className="rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm"
                      >
                        {code}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant={setupMethod === "totp" ? "default" : "outline"}
                    disabled={pending}
                    onClick={() => {
                      setSetupMethod("totp");
                      setSetupCode("");
                    }}
                  >
                    <ShieldCheck />
                    Use authenticator app
                  </Button>
                  <Button
                    type="button"
                    variant={setupMethod === "email" ? "default" : "outline"}
                    disabled={pending}
                    onClick={sendTwoFactorEmailCode}
                  >
                    <Mail />
                    Use email code
                  </Button>
                </div>

                <form onSubmit={verifyTwoFactorSetup}>
                  <FieldGroup>
                    <Field>
                      <FieldLabel>
                        {setupMethod === "email"
                          ? "Email verification code"
                          : "Authenticator app code"}
                      </FieldLabel>
                      <InputOTP
                        maxLength={6}
                        value={setupCode}
                        onChange={setSetupCode}
                      >
                        <InputOTPGroup>
                          {Array.from({ length: 6 }).map((_, index) => (
                            <InputOTPSlot key={index} index={index} />
                          ))}
                        </InputOTPGroup>
                      </InputOTP>
                    </Field>
                    <Button
                      type="submit"
                      disabled={pending || setupCode.length < 6}
                    >
                      Verify and enable 2FA
                    </Button>
                  </FieldGroup>
                </form>
              </div>
            ) : null}
          </FramePanel>
        </Frame>

        <Frame>
          <FramePanel className="space-y-5">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="passkey-name">Passkey label</FieldLabel>
                <Input
                  id="passkey-name"
                  value={passkeyName}
                  onChange={(event) => setPasskeyName(event.target.value)}
                  placeholder="MacBook Pro, Pixel 9, 1Password..."
                />
                <FieldDescription>
                  Optional. This makes it easier to identify passkeys later.
                </FieldDescription>
              </Field>
              <Button
                type="button"
                disabled={pending}
                onClick={handleAddPasskey}
              >
                Add passkey
              </Button>
            </FieldGroup>

            <div className="space-y-3">
              {passkeysState.isPending ? (
                <p className="text-sm text-muted-foreground">
                  Loading passkeys...
                </p>
              ) : passkeys.length > 0 ? (
                passkeys.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-xl border border-border bg-muted/40 p-4"
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-medium">
                        {item.name || "Unnamed passkey"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.deviceType}
                        {item.createdAt
                          ? ` · added ${new Date(item.createdAt).toLocaleDateString()}`
                          : ""}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => handleDeletePasskey(item.id)}
                      aria-label={`Delete ${item.name || "passkey"}`}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No passkeys are registered for this account yet.
                </p>
              )}
            </div>
          </FramePanel>
        </Frame>
      </div>
    </div>
  );
}
