import * as React from "react"

import { cn } from "@/lib/utils"

function Card({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm" }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "group/card flex flex-col gap-4 overflow-hidden rounded-lg bg-card py-4 text-xs/relaxed text-card-foreground ring-1 ring-foreground/10 has-[>img:first-child]:pt-0 data-[size=sm]:gap-3 data-[size=sm]:py-3 *:[img:first-child]:rounded-t-lg *:[img:last-child]:rounded-b-lg",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-lg px-4 group-data-[size=sm]/card:px-3 has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-4 group-data-[size=sm]/card:[.border-b]:pb-3",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("font-heading text-sm font-medium", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-xs/relaxed text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-4 group-data-[size=sm]/card:px-3", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center rounded-b-lg px-4 group-data-[size=sm]/card:px-3 [.border-t]:pt-4 group-data-[size=sm]/card:[.border-t]:pt-3",
        className
      )}
      {...props}
    />
  )
}

function CardFrame({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-frame"
      className={cn(
        "relative flex min-w-0 flex-col rounded-2xl border bg-card not-dark:bg-clip-padding text-card-foreground shadow-xs/5 [--clip-bottom:-1rem] [--clip-top:-1rem] before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-2xl)-1px)] before:bg-muted/72 before:shadow-[0_1px_--theme(--color-black/4%)] has-data-[slot=table-container]:overflow-x-auto has-data-[slot=table-container]:overflow-y-hidden *:data-[slot=card]:-m-px *:data-[slot=table-container]:-m-px *:data-[slot=table-container]:w-[calc(100%+2px)]",
        className,
      )}
      {...props}
    />
  )
}

function CardFrameHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-frame-header"
      className={cn(
        "relative grid auto-rows-min grid-rows-[auto_auto] flex-col items-start gap-x-4 px-6 py-4 has-data-[slot=card-frame-action]:grid-cols-[1fr_auto]",
        className,
      )}
      {...props}
    />
  )
}

function CardFrameTitle({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-frame-title"
      className={cn("self-center text-sm font-semibold", className)}
      {...props}
    />
  )
}

function CardFrameDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-frame-description"
      className={cn("self-center text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardFrameAction({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-frame-action"
      className={cn(
        "col-start-2 inline-flex self-center justify-self-end nth-3:row-span-2 nth-3:row-start-1",
        className,
      )}
      {...props}
    />
  )
}

function CardFrameFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-frame-footer"
      className={cn("px-6 py-4", className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
  CardFrame,
  CardFrameAction,
  CardFrameDescription,
  CardFrameFooter,
  CardFrameHeader,
  CardFrameTitle,
}
