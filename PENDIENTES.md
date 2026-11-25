# Pendientes y contexto para retomar — Centro de Control Right Works

Lee primero `CLAUDE.md` (reglas, arquitectura en 3 capas y estado de cada función). Este archivo solo guarda
lo que NO está ahí: dónde vive cada cosa, reglas de trabajo y lo que quedó a medias. Actualizado: 2026-11-25.

## Dónde vive cada cosa
- **Código**: GitHub `Rightworks01/dashboard-metrics`, rama `main` (Vercel publica cada push a `main`).
- **Sitio**: Vercel, proyecto `rw-dashboard-metrics` (`prj_trHSOoFyH6HoaSU5vZjKHqp6ymNT`, team
  `team_fyn67xOirQlD4dIO6EiDwWzE`), dominio `dashboard.rightworksinsurance.com`. Plan Hobby (registros: 1 hora).
- **Base de datos**: Supabase, proyecto `ehvilfnnmfotbtddhymy`. Migraciones en `supabase/migrations/`, todas aplicadas.
- **GHL**: subcuenta `cQKcGBFkP1QkzRsR6Qdp`, dominio propio `app.rightworksinsurance.com`. App privada de
  Marketplace "Centro de Control RW" (v1.1.0, página personalizada `/sso` en el menú lateral, scope `users.readonly`).
- **Meta**: cuenta publicitaria `2288778941663481`.

## Reglas de trabajo
1. **Nunca pedir secretos en el chat** (tokens, service role key, contraseñas, Client secret, Shared secret). Se cargan
   en las variables de entorno de Vercel o con `request_credential`. Los IDs de arriba no son secretos.
2. Trabajar solo sobre las cuentas de Right Works listadas arriba; no tocar proyectos de otras cuentas que la sesión
   pueda ver.
3. Antes de publicar: `npx tsc --noEmit` y `npm run build` (incluye `check:capas`). En local, el primer `next build`
   puede fallar con SecurityFatalError (aviso de seguridad de Next 16.4.3); al reintentar pasa. En Vercel compila bien.
4. La dueña no es programadora: explicar en español, sin jerga, y mostrar una vista previa antes de cambios visuales grandes.

## Pendientes
1. **Leads Vida en 0 (sin verificar)**. Desde el commit `6c7b566` las pestañas por línea toman todas las campañas de la
   línea desde que arrancó la primera. Falta confirmar con datos. Hipótesis si sigue en 0: la campaña activa de Vida
   ("… Landing IUL") manda a una landing, no a formulario instantáneo; esos contactos solo quedan atribuidos si GHL
   recibe `attributionSource.campaignId` / `utmCampaignId` (`extractAttribution` en `capa1-base/conexiones/ghl/contacts.ts`).
   Consulta útil: leads por `meta_campaign_id` de las campañas cuyo nombre contiene vida/IUL, y contactos recientes con
   `meta_campaign_id` nulo.
2. **Custom JS de GHL (agencia) — doble barra lateral**. Se agregó un tercer `<script>` (guard
   `window.__centroControlFirst`) que pone "Centro de Control RW" primero en el menú y lo abre al entrar a la subcuenta.
   Reporte de la dueña: al entrar a la subcuenta la saca a la vista de agencia y queda doble barra lateral. Causa
   probable: la app está instalada también a nivel agencia y el clic automático abre esa versión, o mover el nodo rompe
   el menú de GHL. Recomendado mientras tanto: borrar ese tercer script (los otros dos — favicon y pestañas
   Script/Aplicación de contactos, guard `window.__contactTabsLoader` — son de ella y no se tocan). Además GHL abre
   "Ask AI" como pantalla de entrada en todos los niveles. Para arreglarlo hace falta una captura del inspector sobre el
   ítem del menú y la URL exacta al entrar. Ojo al pegar: cada script con su propio `</script>`.
3. **Publicar en redes sociales (en espera, a pedido de la dueña; recordárselo)**: posts de Facebook e Instagram,
   Reels/Historias y programación. Falta decidir cómo programar (cron de Supabase cada 5 min, o pasar a Vercel Pro),
   confirmar la cuenta de Instagram ligada a la página, y dar a RightWorksSync los permisos `pages_manage_posts`,
   `instagram_basic`, `instagram_content_publish`.
4. **Actualización de seguridad de Next.js** 16.4.3 → 16.4.6: se le preguntó a la dueña y no respondió.
5. **Sin probar contra Meta**: crear formularios instantáneos y anuncios con varias opciones de texto (Publicar).
6. **SSO**: funciona desde la app del menú lateral (`auth.sso.ok` en los registros). El widget IFrame de un Dashboard
   de GHL no entrega el usuario: ahí solo login manual. Falta comprobar con una sesión real que un User de GHL ve solo
   Leads, Audiencia y Respuesta, y que su nombre sale en vez de su ID tras volver a entrar (commit `3d5154a`).
7. **Preguntas abiertas**: cómo contactan los agentes a los leads (en GHL hay 0 llamadas y casi todos los mensajes son
   automáticos); rotar el token privado (PIT) de GHL; desactivar las claves JWT antiguas de Supabase; borrar el Client
   secret de GHL que se expuso en una captura y generar otro.

## Datos que conviene saber
- Cuentas del equipo (`team_members`): dos administradoras nombradas a mano y un usuario de agencia que entra por SSO
  como Agente. El admin que viene de GHL se recalcula en cada entrada (`admin_from_ghl`).
- Diferencias pequeñas entre leads de Meta y de GHL (p. ej. 19 vs 18) suelen ser retraso de los reportes de Meta o un
  lead que entró después de la última sincronización.
