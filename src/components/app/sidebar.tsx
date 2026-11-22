"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { FolderClosed, LogIn, LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useCanEdit } from "./access";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { setPrefCookie, SIDEBAR_COOKIE } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import { LogoMark } from "./logo";
import { isActive, NAV_ITEMS, SETTINGS_ITEM } from "./nav-items";

export interface NavData {
  counts: { references: number; favorites: number };
  collections: { id: string; name: string }[];
  /** Hosted vaults with a login show a Sign out item. */
  canSignOut?: boolean;
}

async function signOut() {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
  window.location.assign("/login");
}

export function NavList({
  counts,
  collections,
  canSignOut = false,
  collapsed = false,
  onNavigate,
}: NavData & { collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const canEdit = useCanEdit();

  const item = (href: string, label: string, Icon: React.ComponentType<{ className?: string }>, count?: number) => {
    const active = isActive(pathname, href);
    const link = (
      <Link
        href={href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group flex h-9 items-center gap-3 rounded-md px-2.5 text-body text-muted-foreground transition-colors duration-150",
          "hover:bg-sidebar-accent hover:text-foreground",
          active && "bg-sidebar-accent font-medium text-foreground",
          collapsed && "justify-center px-0",
        )}
      >
        <Icon className={cn("size-[17px] shrink-0", active ? "text-foreground" : "text-subtle-foreground group-hover:text-foreground")} />
        {!collapsed && <span className="flex-1 truncate">{label}</span>}
        {!collapsed && count !== undefined && count > 0 && (
          <span className="text-meta tabular-nums text-subtle-foreground">{count}</span>
        )}
      </Link>
    );
    if (!collapsed) return <li key={href}>{link}</li>;
    return (
      <li key={href}>
        <Tooltip>
          <TooltipTrigger asChild>{link}</TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      </li>
    );
  };

  return (
    <nav aria-label="Primary" className="flex flex-1 flex-col gap-6">
      <ul className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((n) => item(n.href, n.label, n.icon, "countKey" in n ? counts[n.countKey] : undefined))}
      </ul>
      {!collapsed && collections.length > 0 && (
        <div>
          <p className="px-2.5 pb-2 text-micro font-medium uppercase text-subtle-foreground">Collections</p>
          <ul className="flex flex-col gap-0.5">
            {collections.map((c) => {
              const href = `/collections/${c.id}`;
              const active = pathname === href;
              return (
                <li key={c.id}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-8 items-center gap-3 rounded-md px-2.5 text-meta text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent hover:text-foreground",
                      active && "bg-sidebar-accent text-foreground",
                    )}
                  >
                    <FolderClosed className="size-3.5 shrink-0 text-subtle-foreground" />
                    <span className="truncate">{c.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <ul className="mt-auto flex flex-col gap-0.5">
        {canEdit ? item(SETTINGS_ITEM.href, SETTINGS_ITEM.label, SETTINGS_ITEM.icon) : item("/login", "Owner sign in", LogIn)}
        {canSignOut && (
          <li>
            <button
              type="button"
              onClick={signOut}
              aria-label="Sign out"
              title={collapsed ? "Sign out" : undefined}
              className={cn(
                "group flex h-9 w-full items-center gap-3 rounded-md px-2.5 text-body text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent hover:text-foreground",
                collapsed && "justify-center px-0",
              )}
            >
              <LogOut className="size-[17px] shrink-0 text-subtle-foreground group-hover:text-foreground" />
              {!collapsed && <span className="flex-1 truncate text-left">Sign out</span>}
            </button>
          </li>
        )}
      </ul>
    </nav>
  );
}

export function Sidebar({ initialCollapsed, ...data }: NavData & { initialCollapsed: boolean }) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const toggle = () => {
    setCollapsed((c) => {
      setPrefCookie(SIDEBAR_COOKIE, c ? "expanded" : "collapsed");
      return !c;
    });
  };

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-3 pb-4 transition-[width] duration-200 ease-[var(--ease-out-soft)] lg:flex",
        collapsed ? "w-[68px]" : "w-[240px]",
      )}
      aria-label="Sidebar"
    >
      <div className={cn("flex h-14 items-center gap-2.5", collapsed ? "justify-center" : "px-1.5")}>
        <Link href="/" className="flex items-center gap-2.5 rounded-md" aria-label="Design Vault home">
          <LogoMark />
          {!collapsed && <span className="text-title font-semibold tracking-tight">Design Vault</span>}
        </Link>
      </div>
      <div className="flex flex-1 flex-col pt-3">
        <NavList {...data} collapsed={collapsed} />
      </div>
      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-expanded={!collapsed}
        className={cn(
          "mt-2 flex h-9 items-center gap-3 rounded-md px-2.5 text-meta text-subtle-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
          collapsed && "justify-center px-0",
        )}
      >
        {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        {!collapsed && <span>Collapse</span>}
      </button>
    </aside>
  );
}
