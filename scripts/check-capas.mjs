// Verifica que las 3 capas no se mezclen (corre antes de cada build; también `npm run check:capas`).
//
//   Capa 1 · capa1-base/     Operaciones: conexiones (GHL, Meta, Supabase), datos/métricas, util (puro) y
//                            acciones (botones y asistentes que ejecutan algo).
//   Capa 2 · capa2-visual/   Lo visual: colores y tokens (estilos/), componentes de presentación, gráficos, mapa.
//   Capa 3 · capa3-cuentas/  Cuentas: login, sesión, tipos de cuenta y qué ve cada uno, consola de accesos.
//   app/                     Solo rutas: cada página conecta las 3 capas (puede importar de todas).
//
// Reglas:
//   1. Capa 1 y Capa 2 NUNCA importan de Capa 3 (cambiar cuentas no toca lo visual ni las operaciones).
//   2. Capa 2 solo usa de Capa 1 tipos (`import type`) y lo puro de capa1-base/util/. Los datos le llegan por props.
//   3. Capa 1 no importa de Capa 2, salvo capa1-base/acciones/ (los botones necesitan piezas visuales).
//   4. Nadie importa de app/ (las rutas están arriba de todo).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const LAYERS = ["capa1-base", "capa2-visual", "capa3-cuentas"];
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(name)) files.push(p);
  }
};
LAYERS.forEach((l) => walk(join(ROOT, l)));

const target = (spec) => {
  if (spec.startsWith("@base/")) return "capa1-base/" + spec.slice(6);
  if (spec.startsWith("@visual/")) return "capa2-visual/" + spec.slice(8);
  if (spec.startsWith("@cuentas/")) return "capa3-cuentas/" + spec.slice(9);
  if (spec.startsWith("@/")) return spec.slice(2);
  return null;
};

const errors = [];
const re = /^\s*(import|export)\s+(type\s+)?[^;]*?from\s+"([^"]+)"|^\s*import\s+"([^"]+)"/gm;
for (const file of files) {
  const rel = relative(ROOT, file);
  const layer = rel.split("/")[0];
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(re)) {
    const spec = m[3] ?? m[4];
    const typeOnly = !!m[2];
    const to = target(spec);
    if (!to) continue;
    const toLayer = to.split("/")[0];
    const fail = (rule) => errors.push(`${rel}: importa "${spec}" — ${rule}`);
    if (toLayer === "app") fail("nadie importa de app/ (regla 4)");
    else if (toLayer === "capa3-cuentas" && layer !== "capa3-cuentas") fail("Capa 1 y 2 no importan de Cuentas (regla 1)");
    else if (layer === "capa2-visual" && toLayer === "capa1-base" && !typeOnly && !to.startsWith("capa1-base/util/"))
      fail("Visual solo usa tipos o capa1-base/util de la Capa 1; los datos llegan por props (regla 2)");
    else if (layer === "capa1-base" && toLayer === "capa2-visual" && !rel.startsWith("capa1-base/acciones/"))
      fail("Capa 1 no importa de Visual, salvo acciones/ (regla 3)");
  }
}
if (errors.length) {
  console.error(`✗ Capas mezcladas (${errors.length}):\n  ` + errors.join("\n  "));
  process.exit(1);
}
console.log(`✓ Capas separadas (${files.length} archivos revisados)`);
