"use client";

import { useEffect, useState } from "react";
import { ssoSignIn } from "@cuentas/login/sso-actions";

/**
 * Dentro de una página de la app de GHL: pide a GHL los datos del usuario (REQUEST_USER_DATA) y entra solo.
 * Si GHL no responde (fuera de la app, o widget sin SSO), no hace nada y queda el login normal.
 */
export function GhlSso() {
  const [state, setState] = useState<"idle" | "entering" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (window.self === window.top) return;
    let done = false;
    const onMessage = async (e: MessageEvent) => {
      const data = e.data as { message?: string; payload?: unknown } | null;
      if (done || data?.message !== "REQUEST_USER_DATA_RESPONSE" || typeof data.payload !== "string") return;
      done = true;
      setState("entering");
      const res = await ssoSignIn(data.payload); // si sale bien, redirige al dashboard
      setState("error");
      setMessage(res.error);
    };
    window.addEventListener("message", onMessage);
    {
      // A la ventana de GHL que contiene la página (y a la principal, por si hay un recuadro intermedio)
      const ask = { message: "REQUEST_USER_DATA" };
      window.parent.postMessage(ask, "*");
      if (window.top && window.top !== window.parent) window.top.postMessage(ask, "*");
    }
    return () => window.removeEventListener("message", onMessage);
  }, []);

  if (state === "idle") return null;
  return (
    <p role="status" className={`rounded-lg px-3 py-2 text-center text-sm ${state === "error" ? "bg-critical-soft text-critical" : "bg-accent-soft text-accent"}`}>
      {state === "entering" ? "Entrando con tu usuario de GHL…" : message}
    </p>
  );
}
