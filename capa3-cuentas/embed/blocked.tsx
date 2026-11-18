/** Respuesta de /embed cuando no se abre desde el CRM o desde otra subcuenta. */
export function EmbedBlocked({ reason }: { reason: "outside" | "location" }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card max-w-sm p-6 text-center">
        <h1 className="text-lg font-semibold text-ink">
          {reason === "outside" ? "Esta página solo se puede abrir desde el CRM" : "Esta subcuenta no tiene acceso"}
        </h1>
        <p className="mt-2 text-sm text-ink-2">
          {reason === "outside"
            ? "Ábrela desde el menú de la subcuenta de Right Works en GoHighLevel."
            : "La pestaña Publicar solo está habilitada para la subcuenta de Right Works."}
        </p>
      </div>
    </main>
  );
}
