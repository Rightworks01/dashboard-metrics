import type { NextConfig } from "next";

// Cabeceras de seguridad para todas las páginas. Solo los dominios del CRM (ALLOWED_PARENT_ORIGINS, por coma) pueden
// mostrar el dashboard dentro de un iframe (Centro de Control en un Dashboard de GHL, y Publicar como Custom Menu
// Link); cualquier otro sitio queda bloqueado (clickjacking sobre "Pausar campaña"). Sin X-Frame-Options (DENY
// bloquearía también a GHL; frame-ancestors manda). No filtra la URL completa (con ?lead=…) a sitios externos y no
// pide cámara/micrófono/ubicación. HSTS ya lo pone Vercel.
const parents = (process.env.ALLOWED_PARENT_ORIGINS ?? "https://app.rightworksinsurance.com,https://app.gohighlevel.com")
  .split(",").map((o) => o.trim().replace(/\/$/, "")).filter(Boolean).join(" ");
const securityHeaders = [
  { key: "Content-Security-Policy", value: `frame-ancestors ${parents}; base-uri 'self'; form-action 'self'; object-src 'none'` },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
