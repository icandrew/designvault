"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { LogIn, Menu, Plus, Search, X } from "lucide-react";
import { useCanEdit } from "./access";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { LogoMark } from "./logo";
import { SearchBox } from "./search-box";
import { NavList, type NavData } from "./sidebar";
import { ThemeMenu } from "./theme-menu";

export function Header(props: NavData) {
  const canEdit = useCanEdit();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/75">
      <div className="flex h-14 items-center gap-2 px-4 sm:gap-3 sm:px-6 lg:px-8">
        <Button
          variant="ghost"
          size="icon"
          className="size-9 lg:hidden"
          aria-label="Open navigation"
          onClick={() => setMenuOpen(true)}
        >
          <Menu className="size-5" />
        </Button>
        <Link href="/" className="flex items-center gap-2 rounded-md lg:hidden" aria-label="Design Vault home">
          <LogoMark className="size-[22px]" />
          <span className="hidden text-title font-semibold tracking-tight min-[420px]:inline">Design Vault</span>
        </Link>

        <Suspense fallback={<div className="hidden h-9 max-w-xl flex-1 sm:block" />}>
          <SearchBox className="hidden max-w-xl flex-1 sm:block" />
        </Suspense>
        <div className="flex-1 sm:hidden" />

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="size-9 sm:hidden"
            aria-label="Search"
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen((o) => !o)}
          >
            {searchOpen ? <X className="size-[18px]" /> : <Search className="size-[18px]" />}
          </Button>
          <ThemeMenu />
          {canEdit ? (
            <Button asChild className="h-9 gap-1.5 px-3 sm:px-3.5">
              <Link href="/references/new">
                <Plus className="size-4" />
                <span className="hidden min-[400px]:inline">Add reference</span>
                <span className="sr-only min-[400px]:hidden">Add reference</span>
              </Link>
            </Button>
          ) : (
            <Button asChild variant="outline" className="h-9 gap-1.5 px-3">
              <Link href="/login">
                <LogIn className="size-4" />
                <span className="hidden min-[400px]:inline">Sign in</span>
                <span className="sr-only min-[400px]:hidden">Sign in</span>
              </Link>
            </Button>
          )}
        </div>
      </div>
      {searchOpen && (
        <div className="border-t px-4 py-2.5 sm:hidden">
          <Suspense>
            <SearchBox autoFocus />
          </Suspense>
        </div>
      )}

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-[280px] gap-0 bg-sidebar p-3 sm:max-w-[280px]">
          <SheetTitle className="flex h-11 items-center gap-2.5 px-1.5">
            <LogoMark />
            <span className="text-title font-semibold tracking-tight">Design Vault</span>
          </SheetTitle>
          <div className="flex flex-1 flex-col pt-4">
            <NavList {...props} onNavigate={() => setMenuOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
