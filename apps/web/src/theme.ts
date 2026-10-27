import { useEffect, useSyncExternalStore } from "react";
import palettes from "../../../design/palettes.json";
export function resolveTheme(choice: string, dark: boolean) {
  return choice === "system"
    ? dark
      ? "obsidian-copper"
      : "clay-sand"
    : choice in palettes.themes
      ? choice
      : "clay-sand";
}
let choice = "system";
try {
  choice = localStorage.getItem("domolyma-theme") || "system";
} catch {}
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getChoice = () => choice;
function setChoice(value: string) {
  if (value !== "system" && !(value in palettes.themes)) return;
  choice = value;
  try {
    localStorage.setItem("domolyma-theme", value);
  } catch {}
  for (const listener of listeners) listener();
}
/** One controller covers the login screen, application and mockups. */
export function ThemeEnvironment() {
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const name = resolveTheme(choice, media.matches);
      const palette = palettes.themes[name as keyof typeof palettes.themes];
      for (const key of ["primary", "accent", "background", "surface"] as const)
        document.documentElement.style.setProperty(`--${key}`, palette[key]);
      document.documentElement.dataset.colorScheme =
        name === "obsidian-copper" ? "dark" : "light";
      document.documentElement.style.colorScheme =
        name === "obsidian-copper" ? "dark" : "light";
    };
    apply();
    const unsubscribe = subscribe(apply);
    media.addEventListener("change", apply);
    return () => {
      unsubscribe();
      media.removeEventListener("change", apply);
    };
  }, []);
  return null;
}
export function useTheme() {
  return [
    useSyncExternalStore(subscribe, getChoice, () => "system"),
    setChoice,
  ] as const;
}
