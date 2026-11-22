import { Clock3, Compass, FolderClosed, Heart, LayoutGrid, Settings } from "lucide-react";

export const NAV_ITEMS = [
  { href: "/", label: "All references", icon: LayoutGrid, countKey: "references" as const },
  { href: "/explore", label: "Explore", icon: Compass },
  { href: "/collections", label: "Collections", icon: FolderClosed },
  { href: "/favorites", label: "Favorites", icon: Heart, countKey: "favorites" as const },
  { href: "/recent", label: "Recently added", icon: Clock3 },
] as const;

export const SETTINGS_ITEM = { href: "/settings", label: "Settings", icon: Settings } as const;

export function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/references");
  return pathname === href || pathname.startsWith(`${href}/`);
}
