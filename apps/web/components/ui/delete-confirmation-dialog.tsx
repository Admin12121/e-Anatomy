"use client";

import { CircleAlertIcon } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Frame, FrameFooter, FramePanel } from "@/components/ui/frame";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function DeleteConfirmationDialog({
  trigger,
  confirmationValue,
  confirmationLabel,
  placeholder,
  disabled = false,
  pending = false,
  confirmLabel = "Delete",
  pendingLabel = "Deleting...",
  title = "Final confirmation",
  descriptionPrefix = "This action cannot be undone. To confirm, please enter the",
  onConfirm,
}: {
  trigger: ReactNode;
  confirmationValue: string;
  confirmationLabel: string;
  placeholder: string;
  disabled?: boolean;
  pending?: boolean;
  confirmLabel?: string;
  pendingLabel?: string;
  title?: string;
  descriptionPrefix?: string;
  onConfirm: () => Promise<void> | void;
}) {
  const id = useId();
  const [inputValue, setInputValue] = useState("");
  const [open, setOpen] = useState(false);

  async function handleConfirm() {
    try {
      await onConfirm();
      setInputValue("");
      setOpen(false);
    } catch {
      // Keep the dialog open when the delete action fails.
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && pending) {
          return;
        }
        if (!nextOpen && !pending) {
          setInputValue("");
        }
        setOpen(nextOpen);
      }}
    >
      <DialogTrigger asChild disabled={disabled}>
        {trigger}
      </DialogTrigger>
      <DialogContent showCloseButton={false} className="p-0 ring-0">
        <Frame>
          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (inputValue !== confirmationValue || pending) {
                return;
              }
              void handleConfirm();
            }}
          >
            <FramePanel block="mb-0">
              <div className="flex flex-col items-center gap-2">
                <div
                  aria-hidden="true"
                  className="flex size-9 shrink-0 items-center justify-center rounded-full border"
                >
                  <CircleAlertIcon className="opacity-80" size={16} />
                </div>
                <DialogHeader>
                  <DialogTitle className="sm:text-center">{title}</DialogTitle>
                  <DialogDescription className="sm:text-center">
                    {descriptionPrefix}{" "}
                    <span className="text-foreground">
                      {confirmationLabel.toLowerCase()}
                    </span>{" "}
                    <span className="text-foreground">{confirmationValue}</span>
                    .
                  </DialogDescription>
                </DialogHeader>
              </div>
              <div className="*:not-first:mt-2 mt-2">
                <Label htmlFor={id}>{confirmationLabel}</Label>
                <Input
                  id={id}
                  onChange={(event) => setInputValue(event.target.value)}
                  placeholder={placeholder}
                  type="text"
                  value={inputValue}
                  disabled={pending}
                />
              </div>
            </FramePanel>
            <FrameFooter className="flex items-center justify-end gap-2 px-2.5 py-2">
              <DialogClose asChild>
                <Button
                  className="flex-1"
                  type="button"
                  variant="outline"
                  disabled={pending}
                >
                  Cancel
                </Button>
              </DialogClose>
              <Button
                className="flex-1"
                disabled={inputValue !== confirmationValue || pending}
                type="submit"
                variant="destructive"
              >
                {pending ? pendingLabel : confirmLabel}
              </Button>
            </FrameFooter>
          </form>
        </Frame>
      </DialogContent>
    </Dialog>
  );
}
