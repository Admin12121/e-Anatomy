"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { GlowingEffect } from "./glowing-effect";

type FrameContextValue = {
  accordion: boolean;
  open: boolean;
  panelId: string;
  toggle: () => void;
};

const FrameContext = React.createContext<FrameContextValue | null>(null);

type FrameProps = React.ComponentProps<"div"> & {
  accordion?: boolean;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

function Frame({
  accordion = false,
  className,
  defaultOpen = true,
  onOpenChange,
  open: openProp,
  ...props
}: FrameProps) {
  const isControlled = openProp !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const open = accordion
    ? (isControlled ? openProp : uncontrolledOpen)
    : true;
  const panelId = React.useId();
  const toggle = React.useCallback(() => {
    if (!accordion) {
      return;
    }

    const nextOpen = !open;

    if (!isControlled) {
      setUncontrolledOpen(nextOpen);
    }

    onOpenChange?.(nextOpen);
  }, [accordion, isControlled, onOpenChange, open]);

  return (
    <FrameContext.Provider
      value={{
        accordion,
        open,
        panelId,
        toggle,
      }}
    >
      <div
        className={cn(
          "relative flex flex-col rounded-2xl bg-muted/72 p-1",
          "*:[[data-slot=frame-panel]+[data-slot=frame-panel]]:mt-1",
          className,
        )}
        data-accordion={accordion ? "true" : undefined}
        data-slot="frame"
        data-state={open ? "open" : "closed"}
        {...props}
      />
    </FrameContext.Provider>
  );
}

function FramePanel({
  block,
  className,
  hidden,
  ...props
}: React.ComponentProps<"div"> & { block?: string }) {
  const context = React.useContext(FrameContext);
  const isHidden = hidden || Boolean(context?.accordion && !context.open);

  return (
    <div className={cn("relative rounded-xl", block)} hidden={isHidden}>
      <GlowingEffect
        variant="white"
        spread={40}
        glow={true}
        disabled={false}
        proximity={64}
        inactiveZone={0.01}
        borderWidth={2}
      />
      <div
        className={cn(
          "relative rounded-xl h-full bg-background bg-clip-padding p-5 shadow-xs/5 before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-xl)-1px)] before:shadow-[0_1px_--theme(--color-black/4%)] dark:before:shadow-[0_-1px_--theme(--color-white/6%)]",
          className,
        )}
        aria-hidden={isHidden}
        id={context?.panelId}
        data-slot="frame-panel"
        data-state={isHidden ? "closed" : "open"}
        {...props}
      />
    </div>
  );
}

function FrameHeader({
  className,
  onClick,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  const context = React.useContext(FrameContext);

  if (context?.accordion) {
    return (
      <button
        aria-controls={context.panelId}
        aria-expanded={context.open}
        className={cn(
          "flex w-full cursor-pointer flex-col px-5 py-4 text-left transition hover:opacity-90",
          className,
        )}
        data-slot="frame-panel-header"
        data-state={context.open ? "open" : "closed"}
        type="button"
        onClick={(event) => {
          onClick?.(event);

          if (event.defaultPrevented) {
            return;
          }

          context.toggle();
        }}
        {...props}
      />
    );
  }

  return (
    <header
      className={cn("flex flex-col px-5 py-4", className)}
      data-slot="frame-panel-header"
      {...props}
    />
  );
}

function FrameTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("font-cormorant text-xl leading-none", className)}
      data-slot="frame-panel-title"
      {...props}
    />
  );
}

function FrameDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "font-at-aero-regular text-muted-foreground text-sm",
        className,
      )}
      data-slot="frame-panel-description"
      {...props}
    />
  );
}

function FrameFooter({ className, ...props }: React.ComponentProps<"footer">) {
  return (
    <footer
      className={cn("px-5 py-4", className)}
      data-slot="frame-panel-footer"
      {...props}
    />
  );
}

export {
  Frame,
  FramePanel,
  FrameHeader,
  FrameTitle,
  FrameDescription,
  FrameFooter,
};
