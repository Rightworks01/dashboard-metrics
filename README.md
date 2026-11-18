# Dashboard Right Works · Meta Ads → GHL

El código está separado en **3 capas** que se editan por separado:

| Capa | Carpeta | Qué contiene | Ejemplos |
|---|---|---|---|
| 1 · Base | `capa1-base/` | Lo que el dashboard **hace**: conexiones (GHL, Meta, Supabase), señales (webhooks, crons), métricas y los botones que ejecutan algo | `conexiones/ghl/`, `datos/metrics.ts`, `acciones/publish-wizard.tsx` |
| 2 · Visual | `capa2-visual/` | Cómo **se ve**: colores, formas, tablas, gráficos, mapa, menú | `estilos/globals.css`, `componentes/daily-chart.tsx` |
| 3 · Cuentas | `capa3-cuentas/` | **Quién** entra y **qué ve**: login, sesión, tipos de cuenta y permisos, consola de accesos | `roles.ts`, `auth.ts`, `accesos/` |
| Rutas | `app/` | Solo las páginas y API: cada una conecta las 3 capas | `app/(dashboard)/leads/page.tsx` |

**Tipos de cuenta** (definidos en `capa3-cuentas/roles.ts`):

| Tipo | Ve |
|---|---|
| Administrador | Todo + Publicar, Reportes, Accesos y sincronizar |
| Completa | Todo, incluidas Campañas y Anuncios; no administra ni publica |
| Sin anuncios | Resumen, Leads, Audiencia, Respuesta y Calidad de datos |
| Agente | Solo sus propios leads: Leads, Audiencia y Respuesta |

`npm run check:capas` verifica que las capas no se mezclen (también corre en cada build). Detalle en `CLAUDE.md`.
