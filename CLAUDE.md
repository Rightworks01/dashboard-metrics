# CLAUDE.md — Proyecto: Dashboard de Atribución Meta Ads + GHL (Right Works)

## Contexto del negocio
Dashboard interno que cruza inversión publicitaria (Meta Marketing API) con leads reales
que entran al CRM (GoHighLevel), para calcular CPL real, tasa de respuesta, costo por
oportunidad y costo por ganado. Volumen: 20–100 leads/día. NO sobre-ingeniería.

## Stack
- **Framework**: Next.js 14+ (App Router) desplegado en Vercel.
- **DB**: Supabase (PostgreSQL). Auth con Supabase Auth.
- **Estilos/UI**: Tailwind CSS + Tremor (componentes de dashboard) o Recharts.
- **Cron**: Vercel Cron Jobs (definidos en `vercel.json`). NUNCA `node-cron`.
- **Lenguaje**: TypeScript estricto. Sin `any` salvo justificación en comentario.

## Reglas de arquitectura (NO romper)
1. **Frontend y backend viven en el mismo proyecto Next.js**. No crear servicios separados.
2. **No introducir n8n, Make ni workflows externos** como dependencia crítica.
3. **Toda la lógica de métricas vive en el backend** (API Routes / Server Actions /
   vistas materializadas en Supabase). El front solo renderiza.
4. **Source-agnostic en conversaciones**: la tabla `messages` debe tener `source_channel`.
   Hoy `ghl`, mañana `wa_connector`. No hardcodear GHL en la lógica de conversaciones.
5. **Sincronización híbrida**:
   - Webhooks de GHL → API Route `/api/webhooks/ghl` (tiempo real).
   - Polling Meta Ads Insights → `/api/cron/sync-meta-ads` (cada 30 min).
   - Reconciliación diaria → `/api/cron/reconcile-ghl` (3 AM, con backoff).
6. **Atribución first-touch** vía `contact_id → meta_ad_id`. No cambiar sin aprobación.

## Reglas de Supabase
- Usar `@supabase/supabase-js` con el cliente **server-side** en Server Components y API Routes.
- **NUNCA** exponer `SUPABASE_SERVICE_ROLE_KEY` al cliente. Solo en API Routes / cron.
- En el cliente, usar la `ANON_KEY` y RLS activado en todas las tablas.
- Migraciones: generar archivos SQL en `supabase/migrations/` con timestamps.
  Aplicarlas con el MCP de Supabase (`apply_migration`), no manualmente en el dashboard.
- RLS: habilitado en TODAS las tablas. Política base: solo usuarios autenticados del equipo leen.

## Reglas de código
- Componentes de servidor por defecto. `"use client"` solo cuando sea estrictamente necesario.
- Fetch de datos: preferir Server Components + `async` functions sobre `useEffect`.
- Nombres de tablas y columnas en `snake_case` (consistente con el SQL).
- Fechas siempre en UTC en DB; formatear en el componente según timezone del usuario.
- Validación de inputs de webhook con Zod.
- Errores de API: siempre `try/catch` + log estructurado (`console.error` con contexto).

## Rate limits y resiliencia
- GHL API v2: paginar con backoff exponencial. Máx 5 reintentos.
- Meta Marketing API: respetar cuota; cachear respuestas en `meta_ads_daily`.
- Vercel Cron: solo corre en **Production**, no en Preview. Tenerlo en cuenta al testear.

## Variables de entorno requeridas
Ver `.env.example` (el original venía truncado en esta sección).

## Estado actual
- Migraciones aplicadas: `init` (5 tablas + vista `metrics_creatives_daily`),
  `conversation_flags` (función `recompute_conversation_flags`) y `metrics_rollup`
  (agrega la vista por total/día/anuncio en un rango; solo `authenticated`) y `appointment_metric`.
- "Oportunidad" en el dashboard = **cita**: `opportunities.appointment_reached_at` se fija (trigger,
  nunca se borra) la primera vez que la oportunidad está en una etapa de cita o posterior o `won`
  (`is_appointment_or_later`; Right Works: Appointment, No Asistio, Reclutado, Appointment Booked,
  Appointment No Show, Appointment No Sale, Sold/Underwriting, Sold/Approved, Canceled/Chargeback). GHL no da historial de
  etapas. Las citas se cuentan por fecha de creación de la oportunidad (cohorte del lead).
- La vista se refresca al final de `sync-meta-ads` y `reconcile-ghl`, no en el webhook.
- **Temporal (plan Hobby de Vercel)**: `sync-meta-ads` corre 1 vez al día (04:00 UTC), no cada
  30 min. Hobby solo permite crons diarios y los dispara en algún momento dentro de esa hora.
  Al pasar a Pro, volver a `*/30 * * * *` en `vercel.json`.
- Lógica de conversaciones agnóstica en `lib/conversations.ts`; el adaptador GHL vive en `lib/ghl/`.
- Dashboard en `app/(dashboard)/` con menú lateral (`app/_components/sidebar.tsx`, conserva ?from&to):
  Resumen (`page.tsx`: KPIs con variación vs. período anterior, tendencias, embudo, top campañas),
  Leads (`leads/`: lista con filtros ?etapa=todos|respondio|cita|ganado|sin_contacto, ?anuncio,
  ?agente (ID de GHL o `sin`) y ?estado (código USPS o `sin`), estos dos con selectores
  (`app/_components/filter-select.tsx`) que cuentan con los demás filtros aplicados,
  ?sort=entrada|contacto|cita&dir; una sola consulta y filtro/conteo/orden en `lib/leads.ts`
  para los contadores de las pestañas; 4 KPIs arriba; nombres en Title Case solo al mostrar
  (`titleCase` en `lib/format.ts`); ficha al pasar el mouse con IDs de Meta en `app/_components/lead-card.tsx`;
  la etiqueta "Ganado" lleva a la pestaña Ganados con `?foco=<uuid>` (esa fila resaltada y centrada);
  panel lateral de solo lectura con `?lead=<uuid>` (clic en la fila o el nombre): origen en Meta, citas y
  línea de tiempo de mensajes/llamadas/citas — `lead_timeline(contact)`, `app/_components/lead-detail.tsx`
  (servidor) + `lead-drawer.tsx` (cliente: Esc/clic fuera). No escribe en GHL: las acciones son enlaces; enlaces a GHL
  vía `GHL_APP_URL` opcional + `GHL_LOCATION_ID`). Las cifras de leads/citas/ganados en KPIs y tablas
  enlazan a Leads ya filtrado. Datos: `leads_list(...)` (migración `leads_list`).
  Campañas (`campanas/`: on/off + sync; por defecto TODAS las campañas de la cuenta — activas y pausadas,
  con o sin gasto —, a diferencia del resto del dashboard; `?camp=activas` explícito para solo activas),
  Anuncios (`anuncios/`: tabla Meta vs GHL ordenable por URL) y Audiencia (`audiencia/`: mapa por
  estado), Respuesta (`respuesta/`: 1er contacto humano por agente, % ≤ 5 min, sin contacto, % de
  respuesta por mensaje de la secuencia sin recordatorios — `sequence_reply_stats` —, y llamadas por
  agente con perdidas devueltas — `call_stats`; lógica por agente en `lib/response.ts`) y Calidad de
  datos (`calidad/`: Meta vs GHL por anuncio, sin estado por campaña, sin contacto > 24 h, sin agente). Piezas compartidas en
  `app/_components/ui.tsx` (PageHeader, Card, Kpi). Un gráfico por magnitud (nunca doble eje).
  Datos vía `lib/metrics.ts`. Colores solo con tokens de `globals.css` (claro/oscuro). El tema sigue
  al sistema salvo que se elija con el interruptor (`app/_components/theme-toggle.tsx`): fija
  `<html data-theme>` y lo guarda en localStorage (`cb-theme`); un script en `app/layout.tsx` lo aplica
  antes de pintar. Logo: `public/logo-mark.png` (monograma RW de Right Works) y favicon `app/icon.png`.
  Login email/contraseña en `app/login/` (Server Actions). `proxy.ts` (Next 16, antes `middleware`)
  refresca la sesión y redirige a `/login`; excluye `/api`. Usuarios se crean a mano en Supabase Auth
  **y se agregan a `team_members`** (migración `team_access`): la RLS solo deja leer a miembros
  (`is_team_member()`), `metrics_rollup` (definer) lo comprueba antes de leer la vista materializada
  (sin acceso directo por la API; la lógica está en `metrics_rollup_unchecked`, sin permisos para
  `authenticated`), el layout muestra "Sin acceso" a quien no es miembro y `campaignControlUser` también lo
  exige. anon/authenticated no tienen permisos de escritura en ninguna tabla (solo service_role).
  Cabeceras de seguridad (no incrustable, Referrer-Policy, etc.) en `next.config.ts`.
- Citas en la UI: en GHL todas se autoconfirman, así que "confirmed" no se muestra. Fase por hora y
  asistencia (`lib/appointments.ts`): pendiente (futura, ⏳ ámbar `warning-ink`), asistió (showed, ✓✓
  verde), no asistió (noshow), cancelada, o "ya pasó" sin marcar asistencia (✓ verde). Ícono/etiqueta en
  `app/_components/appointment-status.tsx` (cliente: la fase usa el reloj del navegador y se refresca cada
  minuto). GHL manda la hora de la cita como ISO **sin zona pero en UTC** ("…T15:30:00" = 10:30 a.m. EST,
  verificado contra GHL): `ghlDateToIso` (`lib/format.ts`) la toma como UTC. Las horas se muestran **siempre en la
  zona del dispositivo de quien mira** por defecto (`useViewerZone` en `local-time.tsx`); si el navegador
  dice UTC (mal configurado o con protección de privacidad), Los Ángeles (Pacífico). El selector del menú
  (`timezone-picker.tsx`, "Automática" por defecto) permite otra zona **solo en esa pestaña**
  (sessionStorage `cb-tz-session`; se borra el viejo localStorage `cb-tz`), así que al volver a entrar manda
  otra vez el dispositivo. El selector guarda la zona en uso en la cookie `cb-tz`; con ella el servidor calcula "hoy" (`viewerToday` en
  `lib/viewer-zone.ts`) para el rango por defecto, los atajos y el máximo de fechas. Los días de las
  métricas y de los filtros de fecha siguen siendo días UTC en SQL. En citas, con la abreviatura de zona (`showZone`). Zona del lead = `contacts.timezone` ({{contact.timezone}} de GHL, migración
  `contact_timezone`): el panel del lead muestra su hora actual y la hora de cada cita para el lead. Teléfono = `contacts.phone`
  (migración `contact_phone`, `phone` de GHL en E.164): en el encabezado del panel, con enlace `tel:` y botón
  Copiar (`copy-button.tsx`; copia el E.164, muestra `fmtPhone`). Si falta, `getContactInfo` lo pide a GHL y lo guarda. Orden por cita (`compareAppointments`): pendientes primero
  (la más próxima), luego las pasadas (la más reciente); es el orden por defecto de la pestaña "Con cita".
  Esa pestaña muestra arriba **Próximas citas** (`getUpcomingAppointments` en `lib/leads.ts`,
  `app/_components/upcoming-appointments.tsx`): todas las citas futuras de leads de Meta, sin importar
  cuándo entró el lead (la tabla cuenta por cohorte y las dejaría fuera); respeta campañas y agente.
- Responsive: en celular el `PageHeader` pone atajos a todo el ancho y fechas + Aplicar en una fila; la
  tabla de Leads se desplaza con la 1ª columna fija. Los contenedores `overflow-x-auto` llevan `relative`
  (si no, los `sr-only` absolutos de dentro escapan y ensanchan la página en celular).
- Moneda fija en `lib/format.ts` (`CURRENCY` = USD, formato es-US: $1,234.56).
- Migración `campaigns_and_state`: `contacts.state/country`, tabla `meta_campaigns` (nombre/estado,
  la llena `sync-meta-ads` y el botón «Sincronizar con Meta»), `metrics_rollup(..., 'campaign')` y
  `leads_by_state(from, to)` (leads atribuidos a Meta por estado crudo; `lib/us-states.ts` normaliza
  a código USPS). Mapa = choropleth EE. UU. (`us-atlas`, rutas SVG calculadas en el servidor).
- **Permisos por persona en `team_members`** (migración `access_console`), leídos con `myAccess()` en
  `lib/auth.ts` (la fila propia, política own_row): `is_admin` (gestiona accesos), `can_see_ads` (Campañas y
  Anuncios; el menú las oculta, las páginas muestran "Sin acceso" y el Resumen quita los enlaces a Campañas) y
  `agent_id`. **Consola `/accesos`** (solo `is_admin`, menú "Administración"): dar acceso por email (crea la
  cuenta de Supabase Auth con contraseña escrita o generada, mostrada una sola vez), cambiar nivel / anuncios /
  admin, nueva contraseña y quitar acceso (borra la fila de team_members, la cuenta queda). Server Actions en
  `app/(dashboard)/accesos/actions.ts` con service role; cada una re-comprueba `is_admin` y nadie puede
  quitarse a sí mismo el admin ni el acceso. Datos en `lib/access-admin.ts`.
- **Miembros limitados a un agente** (migración `agent_scope`): `team_members.agent_id` = ID de usuario de GHL
  (null = ve todo; nunca ven anuncios). La RLS de contacts/conversations/messages/opportunities/appointments solo les deja sus
  leads (`my_agent_scope()`, `can_see_contact()`); las funciones invoker (leads_list, lead_timeline,
  leads_by_state, sequence_reply_stats, call_stats) quedan filtradas solas y `metrics_rollup` se les niega.
  En la app (`agentScope()` en `lib/auth.ts`): menú solo Leads, Audiencia y Respuesta; el Resumen redirige a
  Leads, Calidad muestra "Sin acceso", Leads fuerza `?agente` y Respuesta solo muestra sus llamadas.
- Pausar/activar campañas: `POST /api/meta/campaigns/status` (sesión de Supabase; requiere `canSeeAds` y,
  opcionalmente, estar en `META_CONTROL_EMAILS`). Solo campañas presentes en `meta_campaigns` (la cuenta de
  `META_AD_ACCOUNT_ID`). El token de Meta necesita `ads_management` además de `ads_read`.
- El estado del contacto (`contacts.state`, usado en todo el dashboard) es el **primero con valor**
  entre los custom fields `contact.estado` (el de Right Works), "States" (`contact.states`) de GHL y el campo
  estándar `state` (coinciden por nombre visible o por clave). IDs
  por `GHL_STATE_CUSTOM_FIELD_ID` (uno o varios, por coma) o resueltos por nombre; requiere scope
  `locations/customFields.readonly`. `contacts.geo_synced_at` null = pendiente: `reconcile-ghl` hace un barrido
  completo de contactos mientras haya pendientes (migración `contact_geo_synced`).
- Migración `crm_enrichment`: `messages` con `kind` (canal por mensaje), `sender_user_id` (agente),
  `automated` (workflow/bulk/campaign o saliente sin userId), `origin`, `call_status`,
  `call_duration_s` y `meta` (crudo, solo llamadas). `contacts.name`. Tablas `crm_users` (id → nombre,
  de GHL `/users/`), `appointments` (calendarios GHL, ventana -90/+60 días; webhook
  AppointmentCreate/Update) y `sync_state` (cursores). `reconcile-ghl` además carga por lotes 90 días
  de conversaciones (`conv_backfill_cursor` / `conv_backfill_done`, 4 en paralelo); cada corrida sigue donde quedó.
- Recordatorios y avisos a excluir en estadísticas de respuesta: función SQL `is_reminder(body)`
  (migraciones `response_stats`, `more_reminders`, `internal_notices`). Cubre confirmaciones y
  recordatorios de cita ("Entrevista Reclutamiento -", "cita de re(c)lutamiento con", "Le escribimos en
  nombre de", "recordatorio", "min nos vemos"), avisos de taller en vivo ("Ya estamos por comenzar",
  "La sala ya está abierta"), avisos internos al agente ("Recuerda, este cliente", "Tienes un nuevo
  Lead de") y facturas ("INVOICE FOR"). Para excluir uno nuevo, añadir el patrón ahí.
- **Valores por defecto en todo el dashboard:** rango = mes en curso (día 1 → hoy en la zona de quien mira, `resolveRange`, async), y
  campañas = las ACTIVAS en Meta (`resolveCampaignScope`: sin ?camp = activas, `?camp=todas` = todas,
  `?camp=id1,id2` = esas; los enlaces repiten el alcance con `campQuery(scope)`). Atajos: Este mes,
  Mes pasado, 7d/30d/90d (`rangePresets`). Un rango del día 1 dentro de un mes se compara con los mismos
  días del mes anterior (`previousRange`); otro rango, con el período inmediatamente anterior.
  El Resumen muestra un aviso "Pocos datos todavía" solo si el RANGO elegido cubre menos de 7 días
  (inicio de mes o rango corto); nunca con rangos largos como "Mes pasado", aunque haya pocos días con gasto.
  Selector de campañas: etiqueta "Campañas" por defecto (activas marcadas al abrir, se pueden desmarcar;
  sin ninguna marcada = todas). Gráficos diarios del Resumen: clic en un día fija una ficha con enlaces a
  Leads (y Citas / Campañas) de ese día (`app/_components/daily-chart.tsx`).
- Migración `metrics_filters`: filtro por campaña (`?camp=id1,id2`, vacío = todas) en
  `metrics_rollup(..., p_campaigns)` y `leads_by_state(..., p_campaigns)`; selector en `PageHeader`
  (`app/_components/campaign-filter.tsx`). **Cita** = `contact_has_cita(contact)`: cita de calendario
  no cancelada/invalid **o** oportunidad con `appointment_reached_at`; se cuenta por cohorte del lead
  (columna `opps_appointment`, nombre heredado).
- Diagnóstico de campos de estado: `sync_state` guarda `ghl_contact_custom_fields` (catálogo de custom
  fields de contacto: id/nombre/clave) y `diag_unresolved_state_fields` (IDs de custom fields con valor
  en contactos sin estado), para identificar dónde guarda el estado cada formulario.
- Proyecciones: se probó una pantalla de simulación y se retiró a pedido (confusa y poco práctica);
  la tabla `product_values` (migración `product_values`) queda en la DB sin uso. No reintroducir sin pedirlo.
