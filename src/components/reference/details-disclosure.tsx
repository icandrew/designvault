"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Reference metadata: always visible beside the images on desktop (lg+), and
 * collapsed behind a "Details" toggle on tablet and mobile so the screenshots
 * come first.
 */
export function DetailsDisclosure({ children, label = "Reference details" }: { children: React.ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex h-11 w-full items-center justify-between border-y text-meta font-medium text-foreground lg:hidden"
      >
        {label}
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform duration-200", open && "rotate-180")} />
      </button>
      <div id={id} className={cn(open ? "block" : "hidden", "pt-5 lg:block lg:pt-0")}>
        {children}
      </div>
    </div>
  );
}
