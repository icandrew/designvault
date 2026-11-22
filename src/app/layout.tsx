import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { AppShell } from "@/components/app/app-shell";
import { Providers } from "@/components/app/providers";
import { asTheme, SIDEBAR_COOKIE, THEME_COOKIE, THEME_SCRIPT } from "@/lib/prefs";
import { getLibraryStats } from "@/server/repositories/references";
import { listCollectionOptions } from "@/server/repositories/collections";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Design Vault", template: "%s · Design Vault" },
  description: "A curated visual inspiration library and AI-accessible design reference system.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf8" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1a1d" },
  ],
};

// Local-first app backed by SQLite: every page reads fresh data.
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const store = await cookies();
  const theme = asTheme(store.get(THEME_COOKIE)?.value);
  const sidebarCollapsed = store.get(SIDEBAR_COOKIE)?.value === "collapsed";
  const [stats, collections] = await Promise.all([getLibraryStats(), listCollectionOptions()]);

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${theme === "dark" ? "dark" : ""} h-full antialiased`}
      data-theme-pref={theme}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <Providers initialTheme={theme}>
          <AppShell
            sidebarCollapsed={sidebarCollapsed}
            counts={{ references: stats.references, favorites: stats.favorites }}
            collections={collections.slice(0, 6)}
          >
            {children}
          </AppShell>
        </Providers>
      </body>
    </html>
  );
}
