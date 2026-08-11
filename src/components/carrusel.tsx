import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { CarouselApi } from "@/components/ui/carousel";
import { cn } from "@/lib/utils";

/**
 * Índice de la diapositiva visible de un carrusel de Embla.
 * Devuelve 0 mientras la API no está lista.
 */
export function useCarruselIndice(api: CarouselApi | undefined) {
  const [indice, setIndice] = useState(0);

  useEffect(() => {
    if (!api) return;
    const alSeleccionar = () => setIndice(api.selectedScrollSnap());
    alSeleccionar();
    api.on("select", alSeleccionar);
    api.on("reInit", alSeleccionar);
    return () => {
      api.off("select", alSeleccionar);
      api.off("reInit", alSeleccionar);
    };
  }, [api]);

  return indice;
}

/**
 * Ajusta la altura del carrusel a la de la diapositiva visible, en lugar de
 * dejarla fija a la más alta (que deja un hueco muerto bajo las cortas).
 *
 * Observa la diapositiva activa con ResizeObserver, así que también sigue lo
 * que crece por dentro —un acordeón que se abre— y no solo el cambio de
 * diapositiva. Requiere `items-start` en el CarouselContent: si las
 * diapositivas se estiran, todas miden lo mismo y no hay nada que ajustar.
 */
export function useCarruselAltura(api: CarouselApi | undefined) {
  useEffect(() => {
    if (!api) return;
    const marco = api.containerNode().parentElement;
    if (!marco) return;

    const ajustar = () => {
      const activa = api.slideNodes()[api.selectedScrollSnap()];
      if (activa) marco.style.height = `${activa.offsetHeight}px`;
    };

    let observada: Element | null = null;
    const observador = new ResizeObserver(ajustar);

    const alSeleccionar = () => {
      const activa = api.slideNodes()[api.selectedScrollSnap()];
      if (activa && activa !== observada) {
        if (observada) observador.unobserve(observada);
        observador.observe(activa);
        observada = activa;
      }
      ajustar();
    };

    marco.style.transition = "height 200ms ease";
    alSeleccionar();
    api.on("select", alSeleccionar);
    api.on("reInit", alSeleccionar);

    return () => {
      observador.disconnect();
      api.off("select", alSeleccionar);
      api.off("reInit", alSeleccionar);
      marco.style.height = "";
      marco.style.transition = "";
    };
  }, [api]);
}

interface CarruselControlesProps {
  api: CarouselApi | undefined;
  /** Número de diapositivas. Con menos de dos no se pinta nada. */
  total: number;
  indice: number;
  /** aria-label de cada punto; recibe el índice en base 0. */
  etiquetaPunto: (i: number) => string;
  etiquetaAnterior: string;
  etiquetaSiguiente: string;
  className?: string;
}

/**
 * Flechas + puntos para colocar bajo un carrusel, con el mismo aspecto que el
 * hero de /carreras: punto activo alargado en naranja de acción.
 */
export function CarruselControles({
  api,
  total,
  indice,
  etiquetaPunto,
  etiquetaAnterior,
  etiquetaSiguiente,
  className,
}: CarruselControlesProps) {
  if (total < 2) return null;

  return (
    <div className={cn("mt-6 flex items-center justify-center gap-4", className)}>
      <button
        type="button"
        onClick={() => api?.scrollPrev()}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted"
        aria-label={etiquetaAnterior}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <div className="flex gap-2">
        {Array.from({ length: total }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => api?.scrollTo(i)}
            className={cn(
              "h-2.5 rounded-full transition-all",
              i === indice ? "w-7 bg-secondary" : "w-2.5 bg-border hover:bg-muted-foreground/40",
            )}
            aria-label={etiquetaPunto(i)}
            aria-current={i === indice}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={() => api?.scrollNext()}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted"
        aria-label={etiquetaSiguiente}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
