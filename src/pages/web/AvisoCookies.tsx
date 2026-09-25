import { useEffect, useState } from "react";
import { consentimientoGuardado, guardarConsentimiento, iniciarAnalytics } from "@/lib/analytics";

/**
 * Aviso de cookies de la web propia. Solo aparece si el organizador ha
 * puesto su Google Analytics; sin analytics no hay cookies de terceros y no
 * hace falta aviso. Al aceptar se carga GA4; al rechazar, nada.
 */
export function AvisoCookies({ ga4, hrefCookies }: { ga4: string | undefined; hrefCookies: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!ga4) return;
    const c = consentimientoGuardado();
    if (c === "aceptado") iniciarAnalytics(ga4);
    else if (c === null) setVisible(true);
  }, [ga4]);

  if (!ga4 || !visible) return null;

  const decidir = (v: "aceptado" | "rechazado") => {
    guardarConsentimiento(v);
    if (v === "aceptado") iniciarAnalytics(ga4);
    setVisible(false);
  };

  return (
    <div role="dialog" aria-label="Aviso de cookies" className="fixed inset-x-0 bottom-0 z-[60] px-4 pb-4" style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}>
      <div className="mx-auto flex max-w-[900px] flex-col gap-3 rounded-[14px] border p-4 text-sm sm:flex-row sm:items-center" style={{ background: "#fff", borderColor: "#dfe3d6", color: "#4a5540", fontFamily: "'Barlow', 'Helvetica Neue', Arial, sans-serif" }}>
        <p className="flex-1">
          Esta web usa Google Analytics para saber cuánta gente la visita. Solo se activa si lo aceptas.{" "}
          <a href={hrefCookies} className="underline">Más información</a>.
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={() => decidir("rechazado")} className="min-h-[44px] rounded-[10px] border px-4 font-semibold" style={{ borderColor: "#1a2414", color: "#1a2414", background: "transparent" }}>
            Rechazar
          </button>
          <button type="button" onClick={() => decidir("aceptado")} className="min-h-[44px] rounded-[10px] px-4 font-semibold" style={{ background: "#1a2414", color: "#fff", border: 0 }}>
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
}
