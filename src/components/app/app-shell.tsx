import { Header } from "./header";
import { Sidebar, type NavData } from "./sidebar";

export function AppShell({
  children,
  sidebarCollapsed,
  ...nav
}: NavData & { children: React.ReactNode; sidebarCollapsed: boolean }) {
  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <Sidebar initialCollapsed={sidebarCollapsed} {...nav} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header {...nav} />
        <main id="main" className="flex-1" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
