import { PaginaSecundaria, TituloInterior } from "./PaginaSecundaria";

/** Reglamento completo: las secciones publicadas en Camberas, o el PDF */
export default function PaginaReglamento() {
  return (
    <PaginaSecundaria titulo="Reglamento">
      {(evento, rutas) => {
        const reg = evento.reglamento;
        return (
          <>
            <TituloInterior etiqueta="Reglamento" titulo={`Reglamento ${evento.nombreCorto ?? evento.nombre}`} rutas={rutas} />
            <div className="mx-auto max-w-[900px] px-5 pb-16 pt-10 lg:px-[72px] lg:pb-24">
              {reg?.url && (
                <a href={reg.url} target="_blank" rel="noopener noreferrer" className="wp-btn-outline mb-8" style={{ color: "var(--wp-ink)" }}>
                  Descargar reglamento (PDF)
                </a>
              )}
              {reg?.secciones?.length ? (
                <div className="flex flex-col gap-8">
                  {reg.secciones.map((s, i) => (
                    <section key={`${s.titulo}-${i}`} id={`seccion-${i + 1}`} className="wp-card p-[22px] lg:p-8">
                      <h2 className="text-[24px] lg:text-[28px]">
                        {i + 1}. {s.titulo}
                      </h2>
                      <div className="mt-4 whitespace-pre-line text-[15px] leading-relaxed">{s.texto}</div>
                    </section>
                  ))}
                  {reg.version != null && <p className="text-sm">Versión {reg.version} del reglamento.</p>}
                </div>
              ) : (
                !reg?.url && <p className="text-[15px]">El reglamento se publicará próximamente.</p>
              )}
            </div>
          </>
        );
      }}
    </PaginaSecundaria>
  );
}
