/**
 * Instalar las apps de Camberas (PWA) desde la propia web.
 *
 * Dos problemas que resuelve:
 *
 *  1. El manifest de cada app (/org, /timing) lo pone public/manifest-selector.js
 *     SOLO al cargar la página. Quien llega a /org navegando dentro de la web
 *     —el caso más común: /org sin sesión → /auth → vuelta a /org— se queda sin
 *     manifest, y Chrome solo ofrece un acceso directo en vez de "Instalar
 *     aplicación". asegurarManifest() lo pone al entrar en la pantalla.
 *
 *  2. Chrome avisa de que la app se puede instalar con el evento
 *     beforeinstallprompt, que puede llegar ANTES de que se monte la pantalla.
 *     Por eso se escucha aquí, al arrancar (main.tsx importa este módulo), y se
 *     guarda para que el botón "Instalar app" lo use cuando quiera.
 *
 * iPhone/iPad no tienen ese evento: allí se instala desde Safari, Compartir ›
 * "Añadir a pantalla de inicio", y el botón enseña esos pasos.
 */

interface EventoInstalacion extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let eventoGuardado: EventoInstalacion | null = null;
const suscriptores = new Set<() => void>();
const avisar = () => suscriptores.forEach((f) => f());

/** Rutas cuyo aviso propio de Chrome sustituimos por nuestro botón */
const RUTAS_CON_BOTON = [/^\/org(\/|$)/];

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    // En /org el botón es nuestro; en el resto de la web se deja a Chrome
    if (RUTAS_CON_BOTON.some((r) => r.test(window.location.pathname))) e.preventDefault();
    eventoGuardado = e as EventoInstalacion;
    avisar();
  });
  window.addEventListener("appinstalled", () => {
    eventoGuardado = null;
    avisar();
  });
}

/** Pone (o corrige) el <link rel="manifest"> de la app de esta pantalla */
export function asegurarManifest(href: string): void {
  if (typeof document === "undefined") return;
  const existente = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (existente) {
    if (existente.getAttribute("href") !== href) existente.setAttribute("href", href);
    return;
  }
  const link = document.createElement("link");
  link.rel = "manifest";
  link.href = href;
  document.head.appendChild(link);
}

/** ¿Se está usando ya como app instalada (abierta desde el icono)? */
export function estaInstalada(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.matchMedia?.("(display-mode: fullscreen)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iPhone o iPad (los iPad nuevos se presentan como Mac con pantalla táctil) */
export function esIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** ¿Hay aviso de instalación de Chrome guardado, listo para lanzar? */
export function puedeInstalarDirecto(): boolean {
  return eventoGuardado !== null;
}

/**
 * Lanza el aviso de instalación de Chrome. Devuelve true si el usuario
 * aceptó; false si lo rechazó o si no había aviso (entonces toca explicar
 * los pasos a mano).
 */
export async function pedirInstalacion(): Promise<boolean> {
  const evento = eventoGuardado;
  if (!evento) return false;
  // El aviso solo se puede usar una vez
  eventoGuardado = null;
  avisar();
  await evento.prompt();
  const { outcome } = await evento.userChoice;
  return outcome === "accepted";
}

/** Suscribirse a cambios (llega el aviso, se instala). Devuelve la baja. */
export function alCambiarInstalacion(f: () => void): () => void {
  suscriptores.add(f);
  return () => {
    suscriptores.delete(f);
  };
}
