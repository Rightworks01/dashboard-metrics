"use client";

import { useEffect, useState } from "react";
import { ssoNoAnswer, ssoSignIn } from "@cuentas/login/sso-actions";

const WAIT_MS = 5000;

/**
 * Página /sso (la que abre la app de GHL): SIEMPRE pide a GHL el usuario (REQUEST_USER_DATA), aunque ya haya otra
 * sesión, así el dashboard entra como quien está usando GHL en ese momento (y cambia de usuario si hace falta).
 * Si GHL no responde a tiempo (no está dentro de la app), sigue con la sesión que había o va al login.
 */
export function SsoGate({ hasSession }: { hasSession: boolean }) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let done = false;
    const fallback = () => { if (!done) { done = true; window.location.replace(hasSession ? "/" : "/login?ghl=1"); } };
    const onMessage = async (e: MessageEvent) => {
      const data = e.data as { message?: string; payload?: unknown } | null;
      if (done || data?.message !== "REQUEST_USER_DATA_RESPONSE" || typeof data.payload !== "string") return;
      done = true;
      const res = await ssoSignIn(data.payload); // si sale bien, redirige al dashboard
      setError(res.error);
    };
    window.addEventListener("message", onMessage);
    if (window.self === window.top) fallback();
    else window.parent.postMessage({ message: "REQUEST_USER_DATA" }, "*");
    const timer = setTimeout(() => { if (!done) void ssoNoAnswer().finally(fallback); }, WAIT_MS);
    return () => { window.removeEventListener("message", onMessage); clearTimeout(timer); };
  }, [hasSession]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-sm space-y-3 p-6 text-center">
        {error ? (
          <>
            <p role="alert" className="rounded-lg bg-critical-soft px-3 py-2 text-sm text-critical">{error}</p>
            <a href="/login" className="inline-block text-sm font-medium text-accent hover:underline">Entrar con email y contraseña</a>
          </>
        ) : (
          <p role="status" className="text-sm text-ink-2">Entrando con tu usuario de GHL…</p>
        )}
      </div>
    </main>
  );
}
