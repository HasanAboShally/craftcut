import { useEffect } from "react";
import { useDesignStore } from "../stores/designStore";

export function useTheme() {
  const { settings, updateSettings } = useDesignStore();
  const theme = settings.theme || "light";

  useEffect(() => {
    const root = document.documentElement;
    
    const applyTheme = (isDark: boolean) => {
      if (isDark) {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    };

    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      applyTheme(mediaQuery.matches);
      
      const handler = (e: MediaQueryListEvent) => applyTheme(e.matches);
      mediaQuery.addEventListener("change", handler);
      return () => mediaQuery.removeEventListener("change", handler);
    } else {
      applyTheme(theme === "dark");
    }
  }, [theme]);

  const setTheme = (newTheme: "light" | "dark" | "system") => {
    updateSettings({ theme: newTheme });
  };

  const isDark = theme === "dark" || 
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  return { theme, setTheme, isDark };
}
