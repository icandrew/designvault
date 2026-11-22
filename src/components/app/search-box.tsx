"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

const GALLERY_PATHS = ["/", "/favorites"];

/**
 * Global metadata search. On gallery pages it filters live (debounced) while
 * keeping other filters; elsewhere Enter opens the gallery with the query.
 * Press "/" or Ctrl/⌘+K to focus.
 */
export function SearchBox({ className, autoFocus }: { className?: string; autoFocus?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";
  const [value, setValue] = useState(urlQuery);
  const [lastUrlQuery, setLastUrlQuery] = useState(urlQuery);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const onGallery = GALLERY_PATHS.includes(pathname);

  // Keep the input in sync when the URL changes elsewhere (e.g. "Clear all").
  if (urlQuery !== lastUrlQuery) {
    setLastUrlQuery(urlQuery);
    setValue(urlQuery);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.closest("input, textarea, select, [contenteditable=true]");
      if ((e.key === "/" && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const navigate = (q: string, path = onGallery ? pathname : "/") => {
    const params = new URLSearchParams(onGallery ? searchParams.toString() : "");
    if (q.trim()) params.set("q", q.trim());
    else params.delete("q");
    const qs = params.toString();
    startTransition(() => {
      router.replace(`${path}${qs ? `?${qs}` : ""}`, { scroll: false });
    });
  };

  useEffect(() => {
    if (!onGallery || value.trim() === urlQuery.trim()) return;
    const t = setTimeout(() => navigate(value), 280);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <form
      role="search"
      className={cn("relative", className)}
      onSubmit={(e) => {
        e.preventDefault();
        if (onGallery) navigate(value);
        else startTransition(() => router.push(value.trim() ? `/?q=${encodeURIComponent(value.trim())}` : "/"));
      }}
    >
      <label htmlFor="global-search" className="sr-only">
        Search references
      </label>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle-foreground" />
      <input
        ref={inputRef}
        id="global-search"
        type="search"
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search titles, sites, tags, notes…"
        autoComplete="off"
        className={cn(
          "h-9 w-full rounded-md border border-transparent bg-muted pr-16 pl-9 text-body text-foreground transition-[border-color,background-color] duration-150",
          "placeholder:text-subtle-foreground hover:border-border focus:border-border-strong focus:bg-background focus:outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
          "[&::-webkit-search-cancel-button]:hidden",
        )}
      />
      <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
        {pending && <Loader2 className="size-3.5 animate-spin text-subtle-foreground" aria-hidden />}
        {value ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setValue("");
              if (onGallery) navigate("");
              inputRef.current?.focus();
            }}
            className="grid size-6 place-items-center rounded text-subtle-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        ) : (
          <kbd className="hidden rounded border bg-background px-1.5 font-mono text-micro text-subtle-foreground sm:inline">/</kbd>
        )}
      </div>
    </form>
  );
}
