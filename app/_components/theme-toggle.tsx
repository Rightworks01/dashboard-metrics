"use client";

// Interruptor claro / oscuro. Sin elección guardada sigue al sistema; al pulsarlo fija el tema en
// <html data-theme> y lo recuerda en este navegador (localStorage, solo preferencia visual).
import { useEffect, useState } from "react";

type Theme = "light" | "dark";
const KEY = "cb-theme";

function current(): Theme {
  const set = document.documentElement.dataset.theme;
  if (set === "light" || set === "dark") return set;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme | null>(null); // null hasta montar (evita desajuste con el servidor)
  useEffect(() => setTheme(current()), []);

  function toggle() {
    const next: Theme = current() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(KEY, next); } catch { /* modo privado: solo para esta visita */ }
    setTheme(next);
  }

  const dark = theme === "dark";
  const label = dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro";
  return (
    <button type="button" onClick={toggle} aria-label={label} title={label}
      className={`inline-flex items-center gap-2 rounded-lg text-sm font-medium text-ink-2 hover:bg-surface-2 hover:text-ink ${compact ? "p-1.5" : "px-2 py-1.5"}`}>
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 fill-current">
        {dark ? (
          // sol: al pulsar pasa a claro
          <path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10M2 13h2a1 1 0 0 0 0-2H2a1 1 0 0 0 0 2m18 0h2a1 1 0 0 0 0-2h-2a1 1 0 0 0 0 2M11 2v2a1 1 0 0 0 2 0V2a1 1 0 0 0-2 0m0 18v2a1 1 0 0 0 2 0v-2a1 1 0 0 0-2 0M5.99 4.58a1 1 0 0 0-1.41 1.41l1.06 1.06a1 1 0 0 0 1.41-1.41zm12.37 12.37a1 1 0 0 0-1.41 1.41l1.06 1.06a1 1 0 0 0 1.41-1.41zm1.06-10.96a1 1 0 0 0-1.41-1.41l-1.06 1.06a1 1 0 0 0 1.41 1.41zM7.05 18.36a1 1 0 0 0-1.41-1.41l-1.06 1.06a1 1 0 0 0 1.41 1.41z" />
        ) : (
          // luna: al pulsar pasa a oscuro
          <path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.39 5.39 0 0 1-4.4 2.26 5.4 5.4 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1" />
        )}
      </svg>
      {!compact && <span>{theme == null ? "Tema" : dark ? "Modo claro" : "Modo oscuro"}</span>}
    </button>
  );
}
