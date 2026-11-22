"use client";

import { MotionConfig } from "motion/react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ThemePref } from "@/lib/prefs";
import { AccessProvider } from "./access";
import { GlobalPasteListener } from "./paste-listener";
import { ThemeProvider } from "./theme-provider";

export function Providers({ initialTheme, canEdit = true, children }: { initialTheme: ThemePref; canEdit?: boolean; children: React.ReactNode }) {
  return (
    <ThemeProvider initialTheme={initialTheme}>
      <AccessProvider canEdit={canEdit}>
        <MotionConfig reducedMotion="user" transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
          <TooltipProvider delayDuration={400}>
            {children}
            {canEdit && <GlobalPasteListener />}
            <Toaster position="bottom-right" />
          </TooltipProvider>
        </MotionConfig>
      </AccessProvider>
    </ThemeProvider>
  );
}
