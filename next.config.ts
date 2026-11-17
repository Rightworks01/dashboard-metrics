import type { NextConfig } from "next";

// Cabeceras de seguridad para todas las páginas: el dashboard no se puede incrustar en otro sitio
// (evita clickjacking sobre "Pausar campaña"), no filtra la URL completa (con ?lead=…) a sitios
// externos y no pide cámara/micrófono/ubicación. HSTS ya lo pone Vercel.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

// /embed (pestaña Publicar como Custom Menu Link de GHL): solo la pueden incrustar los dominios del CRM
// (ALLOWED_PARENT_ORIGINS, por coma). Sin X-Frame-Options (DENY la bloquearía); frame-ancestors manda.
const parents = (process.env.ALLOWED_PARENT_ORIGINS ?? "https://app.rightworksinsurance.com")
  .split(",").map((o) => o.trim().replace(/\/$/, "")).filter(Boolean).join(" ");
const embedHeaders = [
  { key: "Content-Security-Policy", value: `frame-ancestors ${parents}; base-uri 'self'; form-action 'self'; object-src 'none'` },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/((?!embed(?:/|$)).*)", headers: securityHeaders },
      { source: "/embed/:path*", headers: embedHeaders },
      { source: "/embed", headers: embedHeaders },
    ];
  },
};

export default nextConfig;
