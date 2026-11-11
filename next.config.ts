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

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
