"use client";

import { MotionConfig } from "motion/react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ThemePref } from "@/lib/prefs";
import { GlobalPasteListener } from "./paste-listener";
import { ThemeProvider } from "./theme-provider";

export function Providers({ initialTheme, children }: { initialTheme: ThemePref; children: React.ReactNode }) {
  return (
    <ThemeProvider initialTheme={initialTheme}>
      <MotionConfig reducedMotion="user" transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
        <TooltipProvider delayDuration={400}>
          {children}
          <GlobalPasteListener />
          <Toaster position="bottom-right" />
        </TooltipProvider>
      </MotionConfig>
    </ThemeProvider>
  );
}
