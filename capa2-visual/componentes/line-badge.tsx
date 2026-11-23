import { LINEAS, type Linea } from "@base/util/lineas";

/** Color de cada línea de trabajo (tokens series-* de globals.css). */
export const LINE_DOT: Record<Linea, string> = { vida: "bg-series-1", comercial: "bg-series-3", reclutamiento: "bg-series-2" };

export function LineDot({ line }: { line: Linea }) {
  return <span aria-hidden="true" className={`inline-block size-2 shrink-0 rounded-full ${LINE_DOT[line]}`} />;
}

export function LineName({ line }: { line: Linea }) {
  return <span className="inline-flex items-center gap-1.5"><LineDot line={line} />{LINEAS[line].short}</span>;
}
