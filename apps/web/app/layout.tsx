import type { Metadata } from "next";
import { Toaster } from "sonner";
import { Inter, Oxanium } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StoreProvider } from "@/lib/store/provider";

import "./globals.css";
import { cn } from "@/lib/utils";

const headingFont = Oxanium({
  subsets: ["latin"],
  variable: "--font-heading",
});

const bodyFont = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Anatomy Platform",
  description: "Backend-first anatomy learning platform bootstrap",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(
        "h-full antialiased",
        bodyFont.variable,
        headingFont.variable,
      )}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-background font-sans text-foreground">
        <StoreProvider>
          <TooltipProvider>
            <ThemeProvider
              attribute="class"
              defaultTheme="system"
              enableSystem
              disableTransitionOnChange
            >
              {children}
              <Toaster />
            </ThemeProvider>
          </TooltipProvider>
        </StoreProvider>
      </body>
    </html>
  );
}
