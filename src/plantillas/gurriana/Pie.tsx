import type { EventoPublico } from "@/eventos/tipos";
import type { RutasWeb } from "@/eventos/menu";
import { useTenant } from "@/tenant/TenantContext";

function Titulo({ children }: { children: string }) {
  return (
    <p className="text-base font-semibold uppercase" style={{ letterSpacing: "2px", color: "#fff" }}>
      {children}
    </p>
  );
}

/** Pie: organizador, documentos, contacto, legal y el "con Camberas" */
export function Pie({ evento, rutas }: { evento: EventoPublico; rutas: RutasWeb }) {
  const { urlCamberas } = useTenant();
  const contacto = evento.contacto ?? {};
  const redes = contacto.redes ?? {};
  const documentos = evento.documentos ?? [];
  return (
    <footer id="contacto" className="px-5 pb-12 pt-12 lg:px-[72px] lg:pb-14 lg:pt-20" style={{ background: "var(--wp-dark)", color: "var(--wp-muted-dark)" }}>
      <div className="mx-auto max-w-[1296px]">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-4 lg:gap-12">
          <div>
            {evento.imagenes?.logo ? (
              <img src={evento.imagenes.logo} alt={evento.nombre} className="w-[160px]" />
            ) : null}
            <p className="wp-display mt-4 text-2xl" style={{ color: "#fff" }}>{evento.nombre}</p>
            {evento.organizador?.nombre && (
              <p className="mt-5 text-[15px]">
                Organiza {evento.organizador.nombre}
                {evento.federacion ? `. ${evento.federacion}` : "."}
              </p>
            )}
          </div>

          {documentos.length > 0 && (
            <div>
              <Titulo>Documentos</Titulo>
              <ul className="mt-5 flex flex-col gap-3 list-none p-0 m-0">
                {documentos.map((d) => (
                  <li key={d.url}>
                    <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-[15px] no-underline hover:underline" style={{ color: "inherit" }}>
                      {d.nombre}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <Titulo>Contacto</Titulo>
            <ul className="mt-5 flex flex-col gap-3 text-[15px] list-none p-0 m-0">
              {contacto.email && <li><a href={`mailto:${contacto.email}`} className="no-underline hover:underline" style={{ color: "inherit" }}>{contacto.email}</a></li>}
              {contacto.emailDatos && <li><a href={`mailto:${contacto.emailDatos}`} className="no-underline hover:underline" style={{ color: "inherit" }}>{contacto.emailDatos}</a></li>}
              {contacto.telefono && <li>{contacto.telefono}</li>}
              {contacto.direccion && <li>{contacto.direccion}</li>}
              {Object.entries(redes).map(([red, url]) => (
                <li key={red}>
                  <a href={url} target="_blank" rel="noopener noreferrer" className="no-underline hover:underline capitalize" style={{ color: "inherit" }}>{red}</a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <Titulo>En carrera</Titulo>
            <ul className="mt-5 flex flex-col gap-3 text-[15px] list-none p-0 m-0">
              {evento.clasificaciones?.url && <li><a href={evento.clasificaciones.url} className="no-underline hover:underline" style={{ color: "inherit" }}>Clasificaciones{evento.clasificaciones.tiempoReal ? " en directo" : ""}</a></li>}
              {evento.gps?.activo && evento.gps.url && <li><a href={evento.gps.url} className="no-underline hover:underline" style={{ color: "inherit" }}>GPS en vivo</a></li>}
              {evento.pruebas.filter((p) => p.track?.gpx).map((p) => (
                <li key={p.id}><a href={p.track!.gpx} download className="no-underline hover:underline" style={{ color: "inherit" }}>Track {p.nombre} (GPX)</a></li>
              ))}
              <li><a href={rutas.a("/aviso-legal")} className="no-underline hover:underline" style={{ color: "inherit" }}>Aviso legal y privacidad</a></li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t pt-6 text-[13px] lg:flex-row lg:items-center lg:justify-between" style={{ borderColor: "var(--wp-border-dark)" }}>
          <p>© {new Date(evento.fecha).getFullYear() || new Date().getFullYear()} {evento.organizador?.nombre ?? evento.nombre}</p>
          <p>
            Inscripciones, cronometraje y resultados con{" "}
            <a href={urlCamberas("/")} className="font-semibold no-underline hover:underline" style={{ color: "#fff" }}>Camberas</a>
          </p>
        </div>
      </div>
    </footer>
  );
}
