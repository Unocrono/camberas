import { useParams } from "react-router-dom";
import { RecorridoDetalle } from "@/plantillas/gurriana/RecorridoDetalle";
import { PaginaSecundaria, TituloInterior } from "./PaginaSecundaria";
import NoEncontradoWeb from "./NoEncontradoWeb";

const TIPO_TEXTO: Record<string, string> = { carrera: "Carrera", marcha: "Marcha", infantil: "Infantil", relevos: "Relevos", km_vertical: "Kilómetro vertical" };

/**
 * Un solo recorrido (evento). Las secciones y su orden los decide el libro
 * de diseño (panel → Web propia → Diseño evento); el contenido está en
 * RecorridoDetalle. Es la página a la que lleva el menú «Recorridos».
 */
export default function PaginaRecorrido() {
  const { pruebaId } = useParams();
  return (
    <PaginaSecundaria titulo="Recorrido">
      {(evento, rutas, tokens) => {
        const prueba = evento.pruebas.find((p) => p.id === pruebaId);
        if (!prueba) return <NoEncontradoWeb />;
        const otras = evento.pruebas.filter((p) => p.id !== prueba.id);
        return (
          <>
            <TituloInterior etiqueta={`${TIPO_TEXTO[prueba.tipo] ?? "Recorrido"}${prueba.competitiva === false ? " · no competitiva" : ""}`} titulo={prueba.nombre} rutas={rutas} />
            <div className="mx-auto max-w-[1296px] px-5 pb-16 pt-8 lg:px-[72px] lg:pb-24">
              {otras.length > 0 && (
                <p className="mb-8 flex flex-wrap items-center gap-2 text-[14px]">
                  <span className="wp-label">Ver también</span>
                  {otras.map((p) => (
                    <a key={p.id} href={rutas.a(`/recorrido/${p.id}`)} className="rounded-full border px-3 py-1 font-semibold no-underline hover:underline" style={{ borderColor: "var(--wp-border)", color: "var(--wp-ink)" }}>
                      {p.nombre}
                    </a>
                  ))}
                </p>
              )}
              <RecorridoDetalle evento={evento} prueba={prueba} rutas={rutas} tokens={tokens} />
            </div>
          </>
        );
      }}
    </PaginaSecundaria>
  );
}
