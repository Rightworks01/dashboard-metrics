# Pendientes y contexto para retomar — Centro de Control Right Works

Lee primero `CLAUDE.md` (reglas, arquitectura en 3 capas y estado de cada función). Este archivo solo guarda
lo que NO está ahí: dónde vive cada cosa, reglas de trabajo y lo que quedó a medias. Actualizado: 2026-11-28.

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
1. **Publicar en redes sociales (en espera, a pedido de la dueña; recordárselo)**: posts de Facebook e Instagram,
   Reels/Historias y programación. Falta decidir cómo programar (cron de Supabase cada 5 min, o pasar a Vercel Pro),
   confirmar la cuenta de Instagram ligada a la página, y dar a RightWorksSync los permisos `pages_manage_posts`,
   `instagram_basic`, `instagram_content_publish`.
2. **Actualización de seguridad de Next.js** 16.4.3 → 16.4.6: se le preguntó a la dueña y no respondió.
3. **Publicar: la app de Meta está en modo de desarrollo (probado el 2026-11-28)**. Prueba directa contra Meta con el
   mismo envío que `publish.ts`: el formulario instantáneo se crea bien (todas las partes llegan; quedó
   "PRUEBA – no usar (Claude)", id `1739922991138774`, en la página RightWorks `1328978853641918` — archivarlo al terminar).
   Campaña y conjunto también. El creativo falla SIEMPRE (con o sin varias opciones de texto): error 1885183 "se creó con
   una app en modo de desarrollo; debe estar en modo público". App = "RIGTH WORKS" (`1651265526505271`). Falta: que la
   dueña la pase a modo Activo en developers.facebook.com (pide URL de política de privacidad) y repetir la prueba de
   las variantes (`asset_feed_spec` + DEGREES_OF_FREEDOM). La campaña de prueba se borró. La página RightWorks no tiene
   Instagram conectado (o RightWorksSync no lo ve): afecta a Publicar en Instagram y al pendiente 1.
4. **SSO**: funciona desde la app del menú lateral (`auth.sso.ok` en los registros). El widget IFrame de un Dashboard
   de GHL no entrega el usuario: ahí solo login manual. Falta comprobar con una sesión real que un User de GHL ve solo
   Leads, Audiencia y Respuesta, y que su nombre sale en vez de su ID tras volver a entrar (commit `3d5154a`).
5. **Preguntas abiertas**: cómo contactan los agentes a los leads (en GHL hay 0 llamadas y casi todos los mensajes son
   automáticos); rotar el token privado (PIT) de GHL; desactivar las claves JWT antiguas de Supabase; borrar el Client
   secret de GHL que se expuso en una captura y generar otro.

## Resuelto (confirmado por la dueña el 2026-11-27)
- Leads Vida en 0: ya salen leads en la pestaña Vida.
- Custom JS de GHL (doble barra lateral al entrar a la subcuenta): arreglado.

## Datos que conviene saber
- Cuentas del equipo (`team_members`): dos administradoras nombradas a mano y un usuario de agencia que entra por SSO
  como Agente. El admin que viene de GHL se recalcula en cada entrada (`admin_from_ghl`).
- Diferencias pequeñas entre leads de Meta y de GHL (p. ej. 19 vs 18) suelen ser retraso de los reportes de Meta o un
  lead que entró después de la última sincronización.
