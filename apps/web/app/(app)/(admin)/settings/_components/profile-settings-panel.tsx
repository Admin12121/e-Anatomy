"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Link2,
  LoaderCircleIcon,
  Mail,
  Unlink2,
  UploadIcon,
  UserRound,
} from "lucide-react";
import { RiGoogleFill } from "@remixicon/react";
import { toast } from "sonner";

import { UserAvatar } from "@/components/account/user-avatar";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import type { SessionUser } from "@/lib/auth/types";
import {
  Frame,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/ui/frame";

export type ConnectedAccount = {
  accountId: string;
  id: string;
  providerId: string;
};

type ProfileSettingsPanelProps = {
  connectedAccounts: ConnectedAccount[];
  googleConfigured: boolean;
  user: SessionUser;
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

function getProviderLabel(providerId: string) {
  switch (providerId) {
    case "google":
      return "Google";
    default:
      return providerId
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map((part) => part[0]!.toUpperCase() + part.slice(1))
        .join(" ");
  }
}

export function ProfileSettingsPanel({
  connectedAccounts,
  googleConfigured,
  user,
}: ProfileSettingsPanelProps) {
  const router = useRouter();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [displayName, setDisplayName] = useState(user.name);
  const [savedName, setSavedName] = useState(user.name);
  const [currentEmail, setCurrentEmail] = useState(user.email);
  const [profileImage, setProfileImage] = useState(user.image);
  const [accountItems, setAccountItems] = useState(connectedAccounts);
  const [isEmailEditorOpen, setIsEmailEditorOpen] = useState(false);
  const [nextEmail, setNextEmail] = useState("");
  const [emailOtp, setEmailOtp] = useState("");
  const [emailChangeTarget, setEmailChangeTarget] = useState<string | null>(
    null,
  );

  const hasGoogleAccount = accountItems.some(
    (account) => account.providerId === "google",
  );

  async function handleProfileUpdate() {
    const nextName = displayName.trim();

    if (!nextName || nextName === savedName) {
      return;
    }

    setPending(true);

    try {
      const result = await authClient.updateUser({
        name: nextName,
      });

      if (result.error) {
        toast.error(
          getErrorMessage(result.error, "Unable to update the profile."),
        );
        return;
      }

      setSavedName(nextName);
      toast.success("Profile updated.");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to update the profile.",
      );
    } finally {
      setPending(false);
    }
  }

  async function handleAvatarUpload(file: File) {
    setPending(true);

    try {
      const formData = new FormData();
      formData.set("file", file);

      const response = await fetch("/api/account/avatar", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: { message?: string }; url?: string }
        | null;

      if (!response.ok || !payload?.url) {
        throw new Error(
          payload?.error?.message || "Unable to upload the profile photo.",
        );
      }

      const result = await authClient.updateUser({
        image: payload.url,
      });

      if (result.error) {
        toast.error(
          getErrorMessage(result.error, "Unable to save the profile photo."),
        );
        return;
      }

      setProfileImage(payload.url);
      toast.success("Profile photo updated.");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to upload the profile photo.",
      );
    } finally {
      setPending(false);
      if (avatarInputRef.current) {
        avatarInputRef.current.value = "";
      }
    }
  }

  async function handleRemoveAvatar() {
    if (!profileImage) {
      return;
    }

    setPending(true);

    try {
      const result = await authClient.updateUser({
        image: null,
      });

      if (result.error) {
        toast.error(
          getErrorMessage(result.error, "Unable to remove the photo."),
        );
        return;
      }

      setProfileImage(null);
      toast.success("Profile photo removed.");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to remove the photo.",
      );
    } finally {
      setPending(false);
    }
  }

  async function handleDisconnectAccount(account: ConnectedAccount) {
    setPending(true);

    try {
      const result = await authClient.unlinkAccount({
        accountId: account.accountId,
        providerId: account.providerId,
      });

      if (result.error) {
        toast.error(
          getErrorMessage(result.error, "Unable to disconnect the account."),
        );
        return;
      }

      setAccountItems((current) =>
        current.filter((item) => item.id !== account.id),
      );
      toast.success(`${getProviderLabel(account.providerId)} disconnected.`);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to disconnect account.",
      );
    } finally {
      setPending(false);
    }
  }

  async function handleLinkGoogle() {
    if (!googleConfigured) {
      toast.error("Google sign-in is not configured for this workspace.");
      return;
    }

    setPending(true);

    try {
      const result = await authClient.linkSocial({
        callbackURL: window.location.href,
        provider: "google",
      });

      if (result?.error) {
        toast.error(
          getErrorMessage(
            result.error,
            "Unable to start Google account linking.",
          ),
        );
        setPending(false);
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to start Google account linking.",
      );
      setPending(false);
    }
  }

  async function handleRequestEmailChange() {
    const normalizedEmail = nextEmail.trim().toLowerCase();

    if (!normalizedEmail) {
      toast.error("Enter the new email address first.");
      return;
    }

    if (normalizedEmail === currentEmail.toLowerCase()) {
      toast.error("Use a different email address.");
      return;
    }

    setPending(true);

    try {
      const result = await authClient.emailOtp.requestEmailChange({
        newEmail: normalizedEmail,
      });

      if (result.error) {
        toast.error(
          getErrorMessage(
            result.error,
            "Unable to send the email change code.",
          ),
        );
        return;
      }

      setEmailChangeTarget(normalizedEmail);
      setEmailOtp("");
      toast.success(`A verification code was sent to ${normalizedEmail}.`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to send the email change code.",
      );
    } finally {
      setPending(false);
    }
  }

  async function handleConfirmEmailChange() {
    if (!emailChangeTarget) {
      toast.error("Request a verification code first.");
      return;
    }

    const trimmedOtp = emailOtp.trim();

    if (!trimmedOtp) {
      toast.error("Enter the verification code from your email.");
      return;
    }

    setPending(true);

    try {
      const result = await authClient.emailOtp.changeEmail({
        newEmail: emailChangeTarget,
        otp: trimmedOtp,
      });

      if (result.error) {
        toast.error(
          getErrorMessage(result.error, "Unable to update your email address."),
        );
        return;
      }

      setCurrentEmail(emailChangeTarget);
      setNextEmail("");
      setEmailOtp("");
      setEmailChangeTarget(null);
      setIsEmailEditorOpen(false);
      toast.success("Email updated.");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to update your email address.",
      );
    } finally {
      setPending(false);
    }
  }

  function closeEmailEditor() {
    setIsEmailEditorOpen(false);
    setNextEmail("");
    setEmailOtp("");
    setEmailChangeTarget(null);
  }

  return (
    <Frame>
      <FramePanel className="space-y-8 pt-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <UserAvatar
            alt={`${displayName || "User"} profile photo`}
            className="size-16"
            image={profileImage}
            seed={user.id}
            size="lg"
          />
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium">Profile picture</p>
              <p className="text-xs text-muted-foreground">
                Upload your own photo, or use your account's stable Blobatar by
                default.
              </p>
            </div>
            <input
              ref={avatarInputRef}
              accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
              aria-label="Choose profile photo"
              className="sr-only"
              disabled={pending}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) {
                  void handleAvatarUpload(file);
                }
              }}
              type="file"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => avatarInputRef.current?.click()}
              >
                {pending ? (
                  <LoaderCircleIcon aria-hidden="true" className="animate-spin" />
                ) : (
                  <UploadIcon aria-hidden="true" />
                )}
                {profileImage ? "Replace photo" : "Upload photo"}
              </Button>
              {profileImage ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={handleRemoveAvatar}
                >
                  Use default avatar
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="settings-name">Full name</FieldLabel>
            <Input
              id="settings-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="border-border"
              placeholder="Your full name"
            />
          </Field>

          <Field>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1">
                <FieldLabel htmlFor="settings-email">Primary email</FieldLabel>
                <FieldDescription>
                  Change your sign-in email with a verification code sent to the
                  new address.
                </FieldDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setIsEmailEditorOpen(true)}
              >
                <Mail />
                Change email
              </Button>
            </div>
            <Input
              id="settings-email"
              value={currentEmail}
              readOnly
              className="border-border"
            />
          </Field>

          {isEmailEditorOpen ? (
            <div className="rounded-2xl border border-border bg-muted/20 p-4">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="settings-next-email">
                    New email
                  </FieldLabel>
                  <Input
                    id="settings-next-email"
                    type="email"
                    value={nextEmail}
                    onChange={(event) => setNextEmail(event.target.value)}
                    className="border-border"
                    placeholder="name@example.com"
                  />
                  <FieldDescription>
                    We will send a verification code to this address before the
                    email is updated.
                  </FieldDescription>
                </Field>

                {emailChangeTarget ? (
                  <Field>
                    <FieldLabel htmlFor="settings-email-otp">
                      Verification code
                    </FieldLabel>
                    <Input
                      id="settings-email-otp"
                      inputMode="numeric"
                      value={emailOtp}
                      onChange={(event) => setEmailOtp(event.target.value)}
                      className="border-border"
                      placeholder="Enter the code from your email"
                    />
                    <FieldDescription>
                      Sent to <strong>{emailChangeTarget}</strong>.
                    </FieldDescription>
                  </Field>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending}
                    onClick={handleRequestEmailChange}
                  >
                    Send code
                  </Button>
                  {emailChangeTarget ? (
                    <Button
                      type="button"
                      disabled={pending || emailOtp.trim().length === 0}
                      onClick={handleConfirmEmailChange}
                    >
                      Confirm email change
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={pending}
                    onClick={closeEmailEditor}
                  >
                    Cancel
                  </Button>
                </div>
              </FieldGroup>
            </div>
          ) : null}
        </FieldGroup>

        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium">Connected accounts</p>
            <p className="text-xs text-muted-foreground">
              Link external providers you want to use for sign-in.
            </p>
          </div>
          <div className="space-y-3">
            {googleConfigured && !hasGoogleAccount ? (
              <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <RiGoogleFill className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Google</p>
                    <p className="text-xs text-muted-foreground">
                      Add Google as another sign-in method for this account.
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={handleLinkGoogle}
                >
                  <Link2 />
                  Connect Google
                </Button>
              </div>
            ) : null}

            {accountItems.length > 0 ? (
              accountItems.map((account) => (
                <div
                  key={account.id}
                  className="flex flex-col gap-3 rounded-xl border border-border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                      {account.providerId === "google" ? (
                        <RiGoogleFill className="size-4" />
                      ) : (
                        <UserRound className="size-4" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {getProviderLabel(account.providerId)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Connected sign-in method
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending}
                    onClick={() => handleDisconnectAccount(account)}
                  >
                    <Unlink2 />
                    Disconnect
                  </Button>
                </div>
              ))
            ) : !googleConfigured ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                No external sign-in providers are configured for this workspace
                yet.
              </div>
            ) : null}
          </div>
        </div>
      </FramePanel>
      <FrameFooter className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Button
          type="button"
          size="lg"
          className="w-full sm:w-auto"
          disabled={
            pending ||
            displayName.trim().length === 0 ||
            displayName.trim() === savedName
          }
          onClick={handleProfileUpdate}
        >
          Update profile
        </Button>
      </FrameFooter>
    </Frame>
  );
}
