/** UI preferences persisted in cookies so the server renders the right layout (no flash). */
export const THEME_COOKIE = "dv_theme";
export const VIEW_COOKIE = "dv_view";
export const DENSITY_COOKIE = "dv_density";
export const SIDEBAR_COOKIE = "dv_sidebar";

export type ThemePref = "light" | "dark" | "system";
export type ViewPref = "masonry" | "grid";
export type DensityPref = "comfortable" | "compact";

export function setPrefCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; SameSite=Lax`;
}

export function asTheme(v: string | undefined): ThemePref {
  return v === "light" || v === "dark" ? v : "system";
}
export function asView(v: string | undefined): ViewPref {
  return v === "grid" ? "grid" : "masonry";
}
export function asDensity(v: string | undefined): DensityPref {
  return v === "compact" ? "compact" : "comfortable";
}

/** Runs before first paint: resolves "system" and keeps it in sync with the OS. */
export const THEME_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]*)/);var t=m?decodeURIComponent(m[1]):"system";var d=document.documentElement;var q=window.matchMedia("(prefers-color-scheme: dark)");function a(){var p=d.getAttribute("data-theme-pref")||"system";var dark=p==="dark"||(p==="system"&&q.matches);d.classList.toggle("dark",dark);d.style.colorScheme=dark?"dark":"light";}d.setAttribute("data-theme-pref",t);a();q.addEventListener("change",a);window.__dvApplyTheme=a;}catch(e){}})();`;
