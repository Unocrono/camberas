/**
 * Últimas inscripciones — cabecera del grupo Corredores.
 *
 * Estaba en la portada; se mueve aquí, encima de los botones del grupo,
 * porque es información de corredores. Se alimenta del MISMO resumen en
 * vivo de la portada (RPC get_organizer_race_summary), así que se
 * actualiza sola con el realtime, sin consultar de nuevo.
 */

interface LastRegistration {
  first_name: string | null;
  last_name: string | null;
  created_at: string;
  payment_status: string;
  bib_number: number | null;
  distance_name: string;
  amount: number | null;
}

interface Props {
  registrations: LastRegistration[];
  /** "hace 5 min" — el mismo formateo que usa la portada */
  timeAgo: (iso: string) => string;
  euro: (n: number) => string;
}

export const OrgLastRegistrations = ({ registrations, timeAgo, euro }: Props) => (
  <section className="mb-4">
    <p className="mb-2 text-sm font-bold uppercase tracking-[0.14em] text-secondary">Últimas inscripciones</p>
    {registrations.length === 0 ? (
      <p className="rounded-xl border border-border bg-card py-6 text-center text-sm text-muted-foreground">
        Aún no hay inscripciones.
      </p>
    ) : (
      <div className="divide-y divide-border rounded-xl border border-border bg-card">
        {registrations.slice(0, 5).map((r, i) => (
          <div key={i} className="flex items-center justify-between px-4 py-2.5">
            <div className="min-w-0">
              <p className="truncate font-medium">
                {r.first_name} {r.last_name}
                {r.bib_number ? <span className="ml-1.5 text-xs text-muted-foreground">#{r.bib_number}</span> : null}
              </p>
              <p className="text-xs text-muted-foreground">
                {r.distance_name} · {timeAgo(r.created_at)}
              </p>
            </div>
            <span
              className={`ml-3 shrink-0 text-sm font-bold ${
                r.payment_status === "paid"
                  ? "text-secondary"
                  : r.payment_status === "not_required"
                    ? "text-primary"
                    : "text-muted-foreground"
              }`}
            >
              {r.payment_status === "paid"
                ? r.amount ? euro(r.amount) : "Pagado"
                : r.payment_status === "not_required"
                  ? "Gratis"
                  : "Pendiente"}
            </span>
          </div>
        ))}
      </div>
    )}
  </section>
);
