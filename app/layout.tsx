import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Right Works · Métricas",
};

// Aplica el tema guardado antes de pintar, para que no parpadee al cargar (ver theme-toggle.tsx)
const THEME_SCRIPT = `try{var t=localStorage.getItem("cb-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
