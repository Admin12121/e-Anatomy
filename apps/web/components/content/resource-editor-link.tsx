"use client";

import type { ComponentProps } from "react";
import Link from "next/link";
import { preloadProjectRichText } from "@/components/anatomy/project-rich-text";

/** Warm the editor chunk without loading it for everyone browsing analytics. */
export function ResourceEditorLink(props: ComponentProps<typeof Link>) {
  return (
    <Link
      {...props}
      onPointerEnter={preloadProjectRichText}
      onFocus={preloadProjectRichText}
    />
  );
}
