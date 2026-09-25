import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { rpcSinTipos } from "@/eventos/rpc";
import type { EstadoInscripcionPublica } from "@/eventos/tipos";
import { useTenant } from "@/tenant/TenantContext";
import { PaginaSecundaria, TituloInterior } from "./PaginaSecundaria";

/**
 * Página a la que vuelve Redsys tras el pago (URLOK → /inscripcion/ok?ref=,
 * URLKO → /inscripcion/ko?ref=). La confirmación real la hace el webhook,
 * que puede llegar un instante después del retorno: se pregunta el estado
 * cada 2 s durante 30 s. Sin datos personales: solo estado, dorsal y prueba.
 */
export default function PaginaInscripcionResultado({ resultado }: { resultado: "ok" | "ko" }) {
  const [searchParams] = useSearchParams();
  const ref = searchParams.get("ref") ?? "";
  const { urlCamberas } = useTenant();
  const [estado, setEstado] = useState<EstadoInscripcionPublica | null>(null);
  const [agotado, setAgotado] = useState(false);

  useEffect(() => {
    if (!ref) return;
    let intentos = 0;
    let parado = false;
    const consultar = async () => {
      let data: EstadoInscripcionPublica | null = null;
      try {
        data = await rpcSinTipos<EstadoInscripcionPublica | null>("estado_inscripcion_publica", { p_registration_id: ref });
      } catch (err) {
        console.error("estado_inscripcion_publica:", err);
      }
      if (parado) return;
      const e: EstadoInscripcionPublica = data ?? { estado: "no_existe" };
      setEstado(e);
      intentos += 1;
      if (e.estado === "pendiente" && intentos < 15) setTimeout(consultar, 2000);
      else if (e.estado === "pendiente") setAgotado(true);
    };
    consultar();
    return () => {
      parado = true;
    };
  }, [ref]);

  return (
    <PaginaSecundaria titulo={resultado === "ok" ? "Inscripción" : "Pago no completado"}>
      {(evento, rutas) => {
        const pagada = estado?.estado === "pagada";
        const fallida = resultado === "ko" || estado?.estado === "fallida" || estado?.estado === "anulada";
        const titulo = pagada ? "¡Inscripción confirmada!" : fallida ? "El pago no se completó" : "Confirmando tu pago…";
        return (
          <>
            <TituloInterior etiqueta={evento.nombre} titulo={titulo} rutas={rutas} />
            <div className="mx-auto max-w-[760px] px-5 pb-16 pt-10 lg:px-[72px] lg:pb-24">
              <div className="wp-card p-[22px] lg:p-8">
                {!ref && <p className="text-[15px]">Falta la referencia de la inscripción. Si has pagado, recibirás el comprobante por email.</p>}

                {ref && pagada && (
                  <>
                    <p className="text-[17px]">
                      Ya estás en la salida de <strong style={{ color: "var(--wp-ink)" }}>{estado?.prueba}</strong>.
                    </p>
                    {estado?.dorsal != null && (
                      <div className="mt-6 inline-block rounded-lg px-6 py-4" style={{ background: "var(--wp-dark)", color: "#fff" }}>
                        <p className="text-[12px] font-semibold uppercase" style={{ letterSpacing: 2, color: "var(--wp-accion)" }}>Tu dorsal</p>
                        <p className="wp-num" style={{ fontSize: 56, color: "#fff" }}>{estado.dorsal}</p>
                      </div>
                    )}
                    <p className="mt-6 text-[15px]">Te hemos enviado el comprobante por email. Guárdalo: lo necesitarás para recoger el dorsal.</p>
                  </>
                )}

                {ref && !pagada && !fallida && (
                  <>
                    <p className="text-[17px]">Estamos confirmando el pago con el banco. Suele tardar unos segundos.</p>
                    {agotado && (
                      <p className="mt-4 text-[15px]">
                        Aún no nos ha llegado la confirmación. No hace falta que hagas nada: cuando llegue recibirás el comprobante por email. Si pasado un rato no lo tienes, escribe al organizador.
                      </p>
                    )}
                  </>
                )}

                {ref && fallida && (
                  <>
                    <p className="text-[17px]">El banco no ha autorizado el cobro o has cancelado el pago. No se te ha cobrado nada.</p>
                    <p className="mt-4 text-[15px]">
                      Tu inscripción queda guardada como pendiente de pago: puedes volver a intentarlo desde el botón de inscripción de la portada (te reconoceremos por tu email) o desde el enlace que te hemos enviado.
                    </p>
                  </>
                )}

                <div className="mt-8 flex flex-wrap gap-3">
                  <a href={rutas.a("/") || "/"} className="wp-btn">Volver a la web</a>
                  {fallida && (
                    <a href={`${rutas.a("/") || "/"}#inscripcion`} className="wp-btn-outline" style={{ color: "var(--wp-ink)" }}>
                      Intentarlo de nuevo
                    </a>
                  )}
                  {pagada && (
                    <a href={urlCamberas(`/${evento.slug}`)} className="wp-btn-outline" style={{ color: "var(--wp-ink)" }}>
                      Ver la carrera en Camberas
                    </a>
                  )}
                </div>
              </div>
            </div>
          </>
        );
      }}
    </PaginaSecundaria>
  );
}
