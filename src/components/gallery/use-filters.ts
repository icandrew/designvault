"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { filtersToSearchParams, type Filters } from "@/lib/domain";

/** Filters live in the URL so views are shareable, bookmarkable and server-rendered. */
export function useFilterNavigation(filters: Filters, fixed: Partial<Filters> = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const setFilters = (patch: Partial<Filters>) => {
    const next: Partial<Filters> = { ...filters, ...patch };
    for (const key of Object.keys(fixed) as (keyof Filters)[]) delete next[key];
    const qs = filtersToSearchParams(next).toString();
    startTransition(() => router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false }));
  };

  const toggleValue = <K extends keyof Filters>(key: K, value: string) => {
    const current = (filters[key] as string[] | undefined) ?? [];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    setFilters({ [key]: next } as Partial<Filters>);
  };

  const clearAll = () => {
    const qs = filters.q ? `?q=${encodeURIComponent(filters.q)}` : "";
    const sort = filters.sort !== "newest" ? `${qs ? "&" : "?"}sort=${filters.sort}` : "";
    startTransition(() => router.replace(`${pathname}${qs}${sort}`, { scroll: false }));
  };

  return { setFilters, toggleValue, clearAll, pending };
}
