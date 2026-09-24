/**
 * Botón "Instalar" de las apps de Camberas (PWA). Ver src/lib/instalarPwa.ts.
 * Por defecto va dentro de un aviso que se puede cerrar (vuelve a los 14 días).
 *
 *  - Ya instalada (abierta desde el icono): no se pinta.
 *  - Android/ordenador con el aviso de Chrome guardado: lo lanza.
 *  - Sin aviso (iPhone, otro navegador, o Chrome aún no lo ha ofrecido):
 *    explica los pasos a mano para ese dispositivo.
 */

import { useEffect, useState } from "react";
import { Download, Share, MoreVertical, PlusSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  alCambiarInstalacion,
  esIOS,
  estaInstalada,
  pedirInstalacion,
  puedeInstalarDirecto,
} from "@/lib/instalarPwa";

interface Props {
  /** Nombre con el que aparece el icono, p. ej. "Camberas Org" */
  nombreApp: string;
  /** Dirección que hay que tener abierta para instalar, p. ej. "camberas.com/org" */
  direccion: string;
  /**
   * "aviso": recuadro con texto, botón y cierre (en una cabecera de móvil no
   * cabe un botón más). "boton": solo el botón.
   */
  variante?: "aviso" | "boton";
  /** Icono de la app para el aviso */
  icono?: string;
}

// Cerrar el aviso lo esconde unos días en este dispositivo, no para siempre:
// quien lo cierra con prisa lo vuelve a ver más adelante
const DIAS_OCULTO = 14;
const claveOculto = (nombreApp: string) => `instalar-oculto:${nombreApp}`;

function avisoOcultoAhora(nombreApp: string): boolean {
  try {
    const hasta = Number(localStorage.getItem(claveOculto(nombreApp)) || 0);
    return hasta > Date.now();
  } catch {
    return false;
  }
}

export function InstalarAppBoton({ nombreApp, direccion, variante = "aviso", icono = "/org-icon-192.png" }: Props) {
  const { toast } = useToast();
  const [instalada, setInstalada] = useState(estaInstalada);
  const [, setVersion] = useState(0);
  const [ayuda, setAyuda] = useState(false);
  const [oculto, setOculto] = useState(() => variante === "aviso" && avisoOcultoAhora(nombreApp));

  useEffect(() => {
    const baja = alCambiarInstalacion(() => {
      setInstalada(estaInstalada());
      setVersion((v) => v + 1);
    });
    const consulta = window.matchMedia?.("(display-mode: standalone)");
    const alCambiarModo = () => setInstalada(estaInstalada());
    consulta?.addEventListener?.("change", alCambiarModo);
    return () => {
      baja();
      consulta?.removeEventListener?.("change", alCambiarModo);
    };
  }, []);

  if (instalada || oculto) return null;

  const cerrarAviso = () => {
    try {
      localStorage.setItem(claveOculto(nombreApp), String(Date.now() + DIAS_OCULTO * 86400000));
    } catch {
      /* sin almacenamiento: se oculta solo en esta visita */
    }
    setOculto(true);
  };

  const instalar = async () => {
    if (puedeInstalarDirecto()) {
      const aceptada = await pedirInstalacion();
      if (aceptada) {
        toast({ title: `${nombreApp} instalada`, description: "Ya la tienes en tu pantalla de inicio." });
      }
      return;
    }
    setAyuda(true);
  };

  const ios = esIOS();

  const boton = (
    <Button
      variant={variante === "aviso" ? "secondary" : "outline"}
      size="sm"
      className="gap-1.5 flex-none"
      onClick={instalar}
      title={`Instalar ${nombreApp}`}
    >
      <Download className="h-4 w-4" />
      Instalar
    </Button>
  );

  return (
    <>
      {variante === "aviso" ? (
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
          <img src={icono} alt="" className="hidden h-10 w-10 flex-none rounded-xl min-[400px]:block" />
          <p className="min-w-0 flex-1 text-sm leading-snug">
            <strong>Instala {nombreApp}</strong>
            <span className="block text-muted-foreground">Icono en tu móvil y se abre como una app.</span>
          </p>
          {boton}
          <button
            type="button"
            onClick={cerrarAviso}
            className="flex-none rounded-md p-1 text-muted-foreground hover:bg-muted"
            aria-label="Cerrar el aviso"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        boton
      )}

      <Dialog open={ayuda} onOpenChange={setAyuda}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Instalar {nombreApp}</DialogTitle>
            <DialogDescription>
              Tendrás su icono en la pantalla de inicio y se abrirá a pantalla completa, como una app.
            </DialogDescription>
          </DialogHeader>

          {ios ? (
            <ol className="space-y-3 text-sm">
              <li className="flex gap-3">
                <span className="font-bold">1.</span>
                <span>Abre <strong>{direccion}</strong> en <strong>Safari</strong> (en otros navegadores del iPhone no se puede).</span>
              </li>
              <li className="flex gap-3">
                <span className="font-bold">2.</span>
                <span className="flex flex-wrap items-center gap-1">
                  Toca <Share className="inline h-4 w-4" /> <strong>Compartir</strong>, abajo en el centro.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="font-bold">3.</span>
                <span className="flex flex-wrap items-center gap-1">
                  Elige <PlusSquare className="inline h-4 w-4" /> <strong>Añadir a pantalla de inicio</strong> y luego{" "}
                  <strong>Añadir</strong>.
                </span>
              </li>
            </ol>
          ) : (
            <ol className="space-y-3 text-sm">
              <li className="flex gap-3">
                <span className="font-bold">1.</span>
                <span className="flex flex-wrap items-center gap-1">
                  Toca el menú <MoreVertical className="inline h-4 w-4" /> del navegador, arriba a la derecha.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="font-bold">2.</span>
                <span>
                  Elige <strong>Instalar aplicación</strong>. Si no aparece, <strong>Añadir a pantalla de inicio</strong> y
                  luego <strong>Instalar</strong>.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="font-bold">3.</span>
                <span>
                  Si solo te deja crear un acceso directo (icono con un logo pequeño de Chrome), recarga esta página y
                  vuelve a intentarlo.
                </span>
              </li>
            </ol>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
