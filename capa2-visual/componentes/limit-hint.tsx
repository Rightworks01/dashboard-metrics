/**
 * Contador con el límite de Meta. No bloquea: si se pasa, avisa en ámbar.
 * `kind` = "hard" (Meta rechaza el texto) o "soft" (Meta lo acepta pero lo corta con "Ver más").
 */
export function LimitHint({ value, limit, kind = "hard" }: { value: string; limit: number; kind?: "hard" | "soft" }) {
  const n = value.trim().length;
  if (n === 0) return null;
  const over = n > limit;
  return (
    <p className={`mt-0.5 text-xs ${over ? "text-warning-ink" : "text-ink-3"}`}>
      {n}/{limit}
      {over && (kind === "hard"
        ? ` · Se pasa del límite de Meta (${limit}). Es probable que Meta lo rechace: acórtalo.`
        : ` · Meta muestra unos ${limit} caracteres y corta el resto con "Ver más".`)}
    </p>
  );
}
