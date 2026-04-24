"use client";

import { useCallback, useRef, type ComponentPropsWithoutRef } from "react";
import { flushSync } from "react-dom";
import { useTheme } from "next-themes";

import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";

interface AnimatedThemeTogglerProps
  extends Omit<ComponentPropsWithoutRef<typeof Switch>, "checked" | "onCheckedChange"> {
  duration?: number;
}

export const AnimatedThemeToggler = ({
  className,
  duration = 400,
  ...props
}: AnimatedThemeTogglerProps) => {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const buttonRef = useRef<HTMLButtonElement>(null);

  const toggleTheme = useCallback(
    (checked: boolean) => {
      if (!buttonRef.current) return;

      const applyTheme = () => {
        setTheme(checked ? "dark" : "light");
      };

      if (
        typeof document === "undefined" ||
        !("startViewTransition" in document)
      ) {
        applyTheme();
        return;
      }

      const transition = document.startViewTransition(() => {
        flushSync(applyTheme);
      });

      const ready = transition?.ready;
      if (ready && typeof ready.then === "function") {
        ready.then(() => {
          const button = buttonRef.current;
          if (!button) return;

          const { top, left, width, height } = button.getBoundingClientRect();

          const x = left + width / 2;
          const y = top + height / 2;

          const maxRadius = Math.hypot(
            Math.max(left, window.innerWidth - left),
            Math.max(top, window.innerHeight - top),
          );

          document.documentElement.animate(
            {
              clipPath: [
                `circle(0px at ${x}px ${y}px)`,
                `circle(${maxRadius}px at ${x}px ${y}px)`,
              ],
            },
            {
              duration,
              easing: "ease-in-out",
              pseudoElement: "::view-transition-new(root)",
            },
          );
        });
      }
    },
    [duration, setTheme],
  );

  return (
    <Switch
      ref={buttonRef}
      onCheckedChange={toggleTheme}
      className={cn(className, "ml-auto")}
      checked={isDark}
      {...props}
    />
  );
};
