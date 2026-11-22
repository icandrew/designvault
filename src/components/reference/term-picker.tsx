"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Plus, ShieldCheck, X } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

function normalize(v: string) {
  return v.trim().replace(/\s+/g, " ").toLowerCase();
}

interface BaseProps {
  id?: string;
  options: string[];
  placeholder?: string;
  creatable?: boolean;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

/** Creatable combobox listing existing vocabulary; prevents case-insensitive duplicates. */
function TermCommand({
  options,
  selected,
  onPick,
  creatable = true,
  placeholder,
}: {
  options: string[];
  selected: string[];
  onPick: (value: string) => void;
  creatable?: boolean;
  placeholder: string;
}) {
  const [query, setQuery] = useState("");
  const selectedSet = useMemo(() => new Set(selected.map(normalize)), [selected]);
  const exists = options.some((o) => normalize(o) === normalize(query)) || selectedSet.has(normalize(query));
  return (
    <Command loop>
      <CommandInput value={query} onValueChange={setQuery} placeholder={placeholder} />
      <CommandList className="max-h-64">
        <CommandEmpty>{creatable ? "Type to create a new term." : "No matches."}</CommandEmpty>
        <CommandGroup>
          {options.map((o) => (
            <CommandItem key={o} value={o} onSelect={() => onPick(o)}>
              <Check className={cn("size-4", selectedSet.has(normalize(o)) ? "opacity-100" : "opacity-0")} />
              {o}
            </CommandItem>
          ))}
        </CommandGroup>
        {creatable && query.trim() && !exists && (
          <CommandGroup forceMount>
            <CommandItem
              forceMount
              value={`__create__${query}`}
              onSelect={() => {
                onPick(query.trim().replace(/\s+/g, " "));
                setQuery("");
              }}
            >
              <Plus className="size-4" />
              Create “{query.trim()}”
            </CommandItem>
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  );
}

export function TermMultiPicker({
  value,
  onChange,
  verified,
  onToggleVerified,
  ...props
}: BaseProps & {
  value: string[];
  onChange: (value: string[]) => void;
  /** Interaction terms: per-term verification state. */
  verified?: Record<string, boolean>;
  onToggleVerified?: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (name: string) => {
    const exists = value.find((v) => normalize(v) === normalize(name));
    onChange(exists ? value.filter((v) => v !== exists) : [...value, name]);
  };
  return (
    <div className="flex flex-col gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            id={props.id}
            type="button"
            aria-expanded={open}
            aria-invalid={props["aria-invalid"]}
            aria-describedby={props["aria-describedby"]}
            className="flex min-h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-body text-subtle-foreground transition-colors hover:border-border-strong aria-invalid:border-destructive"
          >
            <span className="truncate">{value.length ? `${value.length} selected · add more` : props.placeholder ?? "Select…"}</span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-64 p-0" align="start">
          <TermCommand
            options={props.options}
            selected={value}
            onPick={toggle}
            creatable={props.creatable}
            placeholder="Search or create…"
          />
        </PopoverContent>
      </Popover>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Selected">
          {value.map((v) => {
            const isVerified = verified?.[v];
            return (
              <li
                key={v}
                className={cn(
                  "inline-flex h-7 items-center gap-1 rounded-full border bg-card pr-1 pl-2.5 text-meta",
                  isVerified && "border-success/40",
                )}
              >
                {onToggleVerified && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => onToggleVerified(v)}
                        aria-pressed={Boolean(isVerified)}
                        aria-label={`${v}: ${isVerified ? "verified" : "not verified"}. Toggle verification`}
                        className={cn(
                          "-ml-1 grid size-5 place-items-center rounded-full",
                          isVerified ? "text-success" : "text-subtle-foreground hover:text-foreground",
                        )}
                      >
                        <ShieldCheck className="size-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-56">
                      {isVerified
                        ? "Verified: observed live or documented."
                        : "Not verified. Mark verified only if you observed it live or it is documented — not inferred from a screenshot."}
                    </TooltipContent>
                  </Tooltip>
                )}
                {v}
                <button
                  type="button"
                  onClick={() => toggle(v)}
                  aria-label={`Remove ${v}`}
                  className="grid size-5 place-items-center rounded-full text-subtle-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function TermSelect({
  value,
  onChange,
  allowClear,
  ...props
}: BaseProps & { value: string | null | undefined; onChange: (value: string | null) => void; allowClear?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="relative">
        <PopoverTrigger asChild>
          <button
            id={props.id}
            type="button"
            aria-expanded={open}
            aria-invalid={props["aria-invalid"]}
            aria-describedby={props["aria-describedby"]}
            className={cn(
              "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-body transition-colors hover:border-border-strong aria-invalid:border-destructive",
              !value && "text-subtle-foreground",
            )}
          >
            <span className="truncate">{value || props.placeholder || "Select…"}</span>
            <ChevronsUpDown className={cn("size-4 shrink-0 opacity-60", allowClear && value && "invisible")} />
          </button>
        </PopoverTrigger>
        {allowClear && value && (
          <button
            type="button"
            aria-label="Clear"
            onClick={() => onChange(null)}
            className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded text-subtle-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-64 p-0" align="start">
        <TermCommand
          options={props.options}
          selected={value ? [value] : []}
          onPick={(v) => {
            onChange(v);
            setOpen(false);
          }}
          creatable={props.creatable}
          placeholder="Search or create…"
        />
      </PopoverContent>
    </Popover>
  );
}
