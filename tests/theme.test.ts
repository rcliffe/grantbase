import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { isTheme, THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from "@/lib/theme";

/** Runs the <head> script against a stub document and storage; returns the data-theme it set. */
function runInitScript(stored: string | null | Error): string | null {
  let attribute: string | null = null;
  runInNewContext(THEME_INIT_SCRIPT, {
    localStorage: {
      getItem: (key: string) => {
        if (stored instanceof Error) throw stored;
        return key === THEME_STORAGE_KEY ? stored : null;
      },
    },
    document: { documentElement: { setAttribute: (name: string, value: string) => name === "data-theme" && (attribute = value) } },
  });
  return attribute;
}

describe("theme", () => {
  it("applies a stored light or dark preference before the page paints", () => {
    expect(runInitScript("dark")).toBe("dark");
    expect(runInitScript("light")).toBe("light");
  });

  it("follows the device setting when nothing (or nonsense) is stored", () => {
    expect(runInitScript(null)).toBeNull();
    expect(runInitScript("system")).toBeNull();
    expect(runInitScript('"><script>')).toBeNull();
  });

  it("doesn't break the page when storage is blocked", () => {
    expect(runInitScript(new Error("SecurityError"))).toBeNull();
  });

  it("recognises valid preferences", () => {
    expect(["system", "light", "dark"].every(isTheme)).toBe(true);
    expect(isTheme("blue")).toBe(false);
  });
});
