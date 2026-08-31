/**
 * Cupones — pantalla PROPIA de Camberas Org (formato móvil).
 *
 * El caso de uso: el organizador está con el patrocinador, el club o el
 * colaborador, y le manda el descuento AHÍ MISMO, desde el móvil. Y no como
 * un código que el otro tiene que teclear: como un ENLACE que abre la
 * inscripción con el descuento ya aplicado (?cupon=CODIGO en la ficha de la
 * carrera), o como un QR para enseñar en pantalla o poner en un cartel.
 *
 * Los QR llevan URL, no el código pelado — la regla de la casa
 * (docs/tokens-camberas.md): quien escanee con la cámara llega a la
 * inscripción, no a un texto sin sentido.
 *
 * La RLS de coupons ya deja al organizador leer y gestionar los de sus
 * carreras (20260806100000:161-169), así que aquí se lee la tabla directa.
 * Crear y editar cupones se queda en el panel de escritorio: esta pantalla
 * es para REPARTIRLOS.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { qrConLogo } from "@/lib/qrConLogo";
import {
  Copy,
  Loader2,
  QrCode,
  Share2,
  TicketPercent,
  X,
} from "lucide-react";

interface Cupon {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  active: boolean;
  valid_from: string | null;
  valid_until: string | null;
  max_uses: number | null;
  race_distance_id: string | null;
  notes: string | null;
  usos?: number;
  distance_name?: string | null;
}

interface Props {
  raceId: string | null;
}

const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short" });

export const OrgCupones = ({ raceId }: Props) => {
  const { toast } = useToast();
  const [cupones, setCupones] = useState<Cupon[]>([]);
  const [slug, setSlug] = useState<string | null>(null);
  const [raceName, setRaceName] = useState("");
  const [cargando, setCargando] = useState(true);
  // QR abierto en pantalla, para enseñarlo o descargarlo
  const [qr, setQr] = useState<{ cupon: Cupon; png: string } | null>(null);

  const cargar = useCallback(async () => {
    if (!raceId) return;
    setCargando(true);

    const [{ data: race }, { data: cups }, { data: dists }] = await Promise.all([
      supabase.from("races").select("slug, name").eq("id", raceId).single(),
      supabase
        .from("coupons")
        .select("id, code, discount_type, discount_value, active, valid_from, valid_until, max_uses, race_distance_id, notes")
        .eq("race_id", raceId)
        .order("created_at", { ascending: false }),
      supabase.from("race_distances").select("id, name").eq("race_id", raceId),
    ]);

    setSlug(race?.slug ?? null);
    setRaceName(race?.name ?? "");

    const nombreDist = new Map((dists ?? []).map((d: any) => [d.id, d.name]));
    const lista: Cupon[] = (cups ?? []).map((c: any) => ({
      ...c,
      distance_name: c.race_distance_id ? nombreDist.get(c.race_distance_id) ?? null : null,
    }));

    // Usos de cada cupón, para ver de un vistazo cuánto queda
    const conUsos = await Promise.all(
      lista.map(async (c) => {
        const { data: usos } = await supabase.rpc("coupon_uses", { p_coupon_id: c.id });
        return { ...c, usos: (usos as number) ?? 0 };
      }),
    );

    setCupones(conUsos);
    setCargando(false);
  }, [raceId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  /** El enlace que se comparte: la ficha de la carrera con el cupón puesto */
  const enlace = (c: Cupon) =>
    `${window.location.origin}/${slug ?? `race/${raceId}`}?cupon=${encodeURIComponent(c.code)}`;

  const textoDescuento = (c: Cupon) =>
    c.discount_type === "percent" ? `${c.discount_value}%` : `${c.discount_value} €`;

  const compartirWhatsApp = (c: Cupon) => {
    const texto =
      `Te paso un descuento del ${textoDescuento(c)} para ${raceName}` +
      (c.distance_name ? ` (${c.distance_name})` : "") +
      `. Abre el enlace y el descuento se aplica solo al inscribirte: ${enlace(c)}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
  };

  const copiar = (c: Cupon) => {
    navigator.clipboard.writeText(enlace(c));
    toast({ title: "Enlace copiado", description: "Con el descuento incluido: pégalo donde quieras." });
  };

  const abrirQr = async (c: Cupon) => {
    const png = await qrConLogo(enlace(c));
    setQr({ cupon: c, png });
  };

  /** ¿Está en condiciones de usarse ahora mismo? */
  const estado = (c: Cupon): { texto: string; vivo: boolean } => {
    if (!c.active) return { texto: "desactivado", vivo: false };
    const ahora = new Date();
    if (c.valid_from && ahora < new Date(c.valid_from))
      return { texto: `desde el ${fechaCorta(c.valid_from)}`, vivo: false };
    if (c.valid_until && ahora > new Date(c.valid_until))
      return { texto: "caducado", vivo: false };
    if (c.max_uses != null && (c.usos ?? 0) >= c.max_uses)
      return { texto: "agotado", vivo: false };
    return { texto: "en vigor", vivo: true };
  };

  if (!raceId) return null;

  if (cargando) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-secondary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {cupones.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center space-y-2">
          <TicketPercent className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Esta carrera no tiene cupones. Se crean desde el panel, en Cupones y descuentos, y
            aparecen aquí listos para repartir.
          </p>
        </div>
      ) : (
        cupones.map((c) => {
          const e = estado(c);
          return (
            <div key={c.id} className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-archivo text-lg uppercase tracking-wide truncate">{c.code}</p>
                  <p className="text-sm text-muted-foreground">
                    −{textoDescuento(c)}
                    {c.distance_name ? ` · solo ${c.distance_name}` : " · toda la carrera"}
                  </p>
                  {c.notes && (
                    <p className="text-xs text-muted-foreground truncate">{c.notes}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${
                      e.vivo ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {e.texto}
                  </span>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {c.usos ?? 0}
                    {c.max_uses != null ? ` / ${c.max_uses}` : ""} usos
                  </p>
                </div>
              </div>

              {/* Repartir: enlace con el descuento puesto, nunca el código pelado */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => compartirWhatsApp(c)}
                  disabled={!e.vivo}
                  className="flex flex-col items-center gap-1 rounded-lg border border-border py-2.5 text-xs font-semibold uppercase disabled:opacity-40"
                >
                  <Share2 className="h-4 w-4" />
                  WhatsApp
                </button>
                <button
                  onClick={() => copiar(c)}
                  disabled={!e.vivo}
                  className="flex flex-col items-center gap-1 rounded-lg border border-border py-2.5 text-xs font-semibold uppercase disabled:opacity-40"
                >
                  <Copy className="h-4 w-4" />
                  Copiar
                </button>
                <button
                  onClick={() => abrirQr(c)}
                  disabled={!e.vivo}
                  className="flex flex-col items-center gap-1 rounded-lg border border-border py-2.5 text-xs font-semibold uppercase disabled:opacity-40"
                >
                  <QrCode className="h-4 w-4" />
                  QR
                </button>
              </div>
            </div>
          );
        })
      )}

      <p className="text-xs text-muted-foreground">
        El enlace abre la inscripción con el descuento ya aplicado: quien lo recibe no teclea
        nada. El QR lleva ese mismo enlace, para enseñarlo en persona o ponerlo en un cartel.
      </p>

      {/* QR a pantalla, para enseñar o guardar */}
      {qr && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
          onClick={() => setQr(null)}
        >
          <div
            className="w-full max-w-xs rounded-2xl bg-white p-5 text-center space-y-3"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <p className="font-archivo uppercase text-neutral-900">{qr.cupon.code}</p>
              <button onClick={() => setQr(null)}>
                <X className="h-5 w-5 text-neutral-500" />
              </button>
            </div>
            <img src={qr.png} alt={`QR del cupón ${qr.cupon.code}`} className="w-full" />
            <p className="text-xs text-neutral-500">
              −{textoDescuento(qr.cupon)} · {raceName}
            </p>
            <a
              href={qr.png}
              download={`cupon-${qr.cupon.code}.png`}
              className="block rounded-lg bg-neutral-900 py-2.5 text-sm font-bold uppercase text-white"
            >
              Guardar imagen
            </a>
          </div>
        </div>
      )}
    </div>
  );
};
