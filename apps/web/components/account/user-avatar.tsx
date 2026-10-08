"use client"

import { useState, type ComponentProps } from "react"
import { Blobatar } from "@blobatar/react"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

type UserAvatarProps = ComponentProps<typeof Avatar> & {
  alt?: string
  fallbackClassName?: string
  image?: string | null
  seed: string
}

/**
 * One avatar rule for the whole app:
 * - a user-uploaded/profile image wins when present
 * - otherwise Blobatar renders a deterministic avatar from the stable user id
 */
export function UserAvatar({
  alt = "User avatar",
  className,
  fallbackClassName,
  image,
  seed,
  ...props
}: UserAvatarProps) {
  // Keyed by URL so a new image starts hidden without resetting in an effect.
  const [loadedImage, setLoadedImage] = useState<string | null>(null)
  const [failedImage, setFailedImage] = useState<string | null>(null)
  const imageLoaded = Boolean(image) && loadedImage === image
  const imageFailed = Boolean(image) && failedImage === image

  const showUploadedImage = Boolean(image) && !imageFailed

  return (
    <Avatar
      className={cn("after:hidden after:border-0", className)}
      {...props}
    >
      {showUploadedImage ? (
        <AvatarImage
          alt={alt}
          className={cn(
            "transition-opacity duration-200",
            imageLoaded ? "opacity-100" : "opacity-0",
          )}
          onError={() => setFailedImage(image ?? null)}
          onLoad={() => setLoadedImage(image ?? null)}
          src={image ?? undefined}
        />
      ) : null}

      {showUploadedImage && !imageLoaded ? (
        <Skeleton
          aria-label={`Loading ${alt}`}
          className="absolute inset-0 z-10 size-full rounded-md"
          role="status"
        />
      ) : null}

      <AvatarFallback
        className={cn(
          "overflow-hidden bg-transparent p-0 text-transparent",
          fallbackClassName,
        )}
      >
        <Blobatar
          alt={alt}
          aria-hidden="true"
          className="size-full object-cover"
          name={seed}
        />
      </AvatarFallback>
    </Avatar>
  )
}
