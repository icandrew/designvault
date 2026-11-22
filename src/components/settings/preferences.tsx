"use client";

import { useRouter } from "next/navigation";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/app/theme-provider";
import { DENSITY_COOKIE, setPrefCookie, VIEW_COOKIE, type DensityPref, type ThemePref, type ViewPref } from "@/lib/prefs";
import { cn } from "@/lib/utils";

function Options<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; icon?: React.ComponentType<{ className?: string }> }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn("flex h-9 items-center gap-2 rounded-md border px-3 text-meta transition-colors", value === o.value ? "border-foreground bg-accent" : "hover:bg-accent/50")}
        >
          {o.icon && <o.icon className="size-4" />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Preferences({ view, density }: { view: ViewPref; density: DensityPref }) {
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="text-meta font-medium">App theme</p>
        <Options<ThemePref>
          label="App theme"
          value={theme}
          onChange={setTheme}
          options={[
            { value: "light", label: "Light", icon: Sun },
            { value: "dark", label: "Dark", icon: Moon },
            { value: "system", label: "System", icon: Monitor },
          ]}
        />
        <p className="text-micro text-subtle-foreground">Changes the Design Vault interface only. Screenshots and their captured-theme classification never change.</p>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-meta font-medium">Gallery layout</p>
        <Options<ViewPref>
          label="Gallery layout"
          value={view}
          onChange={(v) => {
            setPrefCookie(VIEW_COOKIE, v);
            router.refresh();
          }}
          options={[
            { value: "masonry", label: "Masonry" },
            { value: "grid", label: "Uniform grid" },
          ]}
        />
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-meta font-medium">Gallery density</p>
        <Options<DensityPref>
          label="Gallery density"
          value={density}
          onChange={(v) => {
            setPrefCookie(DENSITY_COOKIE, v);
            router.refresh();
          }}
          options={[
            { value: "comfortable", label: "Comfortable" },
            { value: "compact", label: "Compact" },
          ]}
        />
      </div>
    </div>
  );
}
