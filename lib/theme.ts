/**
 * Colour theme preference. "system" follows the device setting; "light" and "dark"
 * override it. The choice is kept in localStorage (per browser) and applied as a
 * data-theme attribute on <html>, which globals.css turns into `color-scheme`.
 *
 * It isn't a cookie on purpose: reading a cookie on the server would stop pages
 * from being prerendered (see the Next.js "preventing flash" guide).
 */
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_STORAGE_KEY = "gb-theme";

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

/**
 * Runs in <head> before the first paint, so a stored preference never flashes the
 * other theme. Kept tiny and dependency-free; mirrors applyTheme() below.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

/**
 * Applies a preference to the page. "system" removes the override. Transitions are
 * paused for the switch, so every colour changes at once instead of buttons fading.
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if ((root.getAttribute("data-theme") ?? "system") === theme) return;
  root.classList.add("theme-switching");
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  void getComputedStyle(root).color; // flush styles with transitions off
  requestAnimationFrame(() => root.classList.remove("theme-switching"));
}
