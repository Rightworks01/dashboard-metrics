"use client";

// Client Component solo para el "ojito": alterna el campo entre oculto y visible.
import { useState } from "react";

export function PasswordInput() {
  const [visible, setVisible] = useState(false);
  const label = visible ? "Ocultar contraseña" : "Mostrar contraseña";
  return (
    <div className="relative mt-1">
      <input name="password" type={visible ? "text" : "password"} required autoComplete="current-password"
        className="w-full rounded-lg border border-line bg-surface-2 py-2 pl-3 pr-10 text-ink outline-none focus:border-accent" />
      <button type="button" onClick={() => setVisible(!visible)} aria-label={label} title={label} aria-pressed={visible}
        className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-lg text-ink-3 hover:text-ink focus-visible:text-ink focus-visible:outline-none">
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 fill-current">
          {visible ? (
            // ojo tachado: pulsar para ocultar
            <path d="M12 7a5 5 0 0 1 5 5c0 .65-.13 1.26-.36 1.83l2.92 2.92A11.8 11.8 0 0 0 22.99 12c-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7M2 4.27l2.28 2.28.46.46A11.8 11.8 0 0 0 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3zM7.53 9.8l1.55 1.55A2.8 2.8 0 0 0 9 12a3 3 0 0 0 3 3c.22 0 .44-.03.65-.08l1.55 1.55A5 5 0 0 1 7 12c0-.79.2-1.53.53-2.2m4.31-.78 3.15 3.15.02-.16a3 3 0 0 0-3-3z" />
          ) : (
            // ojo: pulsar para mostrar
            <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5M12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10m0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6" />
          )}
        </svg>
      </button>
    </div>
  );
}
