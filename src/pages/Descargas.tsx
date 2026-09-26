/**
 * camberas.com/descargas — la puerta única para instalar Camberas Track.
 *
 * Es el enlace que va en el correo «Camberas Track» de cada inscrito y el que
 * se pasa por WhatsApp: se detecta el móvil y se destaca la tienda que le
 * toca a quien mira, con la otra a mano por si comparte pantalla.
 *
 * Desde el 25-ago-2026 las dos van a su tienda. El interruptor
 * ANDROID_EN_TIENDA se queda por si algún día hay que volver a repartir
 * APK (una beta, un móvil sin servicios de Google): a false, el botón
 * descarga el fichero y reaparece el aviso de "orígenes desconocidos".
 */

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Apple, Smartphone, ShieldCheck, MapPin, WifiOff, Info, Download, QrCode, Play } from "lucide-react";
import capturaTrack from "@/assets/track-app.jpg";

const IOS_URL = "https://apps.apple.com/es/app/camberas-track/id6792264406";
const ANDROID_URL =
  "https://play.google.com/store/apps/details?id=com.unocrono.camberastrack";
const ANDROID_EN_TIENDA = true; // publicada en Google Play el 25-ago-2026

type Sistema = "ios" | "android" | "otro";

/** Qué móvil tiene delante quien mira la página */
const detectarSistema = (): Sistema => {
  if (typeof navigator === "undefined") return "otro";
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return "android";
  // El iPad se presenta como Mac desde iPadOS 13: se delata por el táctil
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/macintosh|mac os x/i.test(ua) && navigator.maxTouchPoints > 1) return "ios";
  return "otro";
};

const Descargas = () => {
  const [sistema, setSistema] = useState<Sistema>("otro");
  useEffect(() => setSistema(detectarSistema()), []);

  const botonIOS = (destacado: boolean) => (
    <Button key="ios" size="sm" variant={destacado ? "default" : "outline"} asChild>
      <a href={IOS_URL} target="_blank" rel="noopener noreferrer">
        <Apple className="h-4 w-4 mr-2" />
        App Store
      </a>
    </Button>
  );

  const botonAndroid = (destacado: boolean) => (
    <Button key="android" size="sm" variant={destacado ? "default" : "outline"} asChild>
      <a href={ANDROID_URL} target="_blank" rel="noopener noreferrer">
        <Smartphone className="h-4 w-4 mr-2" />
        {ANDROID_EN_TIENDA ? "Google Play" : "Descargar la app (93 MB)"}
      </a>
    </Button>
  );

  // El del móvil de quien mira, primero y destacado
  const botones =
    sistema === "android"
      ? [botonAndroid(true), botonIOS(false)]
      : sistema === "ios"
        ? [botonIOS(true), botonAndroid(false)]
        : [botonIOS(true), botonAndroid(true)];

  const pasos = [
    {
      icono: Download,
      titulo: "Instala la app",
      texto: "Gratis, sin registro y sin publicidad.",
    },
    {
      icono: QrCode,
      titulo: "Activa tu dorsal",
      texto:
        "Con el enlace o el QR del correo «Camberas Track» que te manda la organización. Sin usuario ni contraseña: tu dorsal es tu identidad.",
    },
    {
      icono: Play,
      titulo: "En la salida, Activar seguimiento",
      texto:
        "Permite la ubicación «siempre» y sin restricciones de batería. Puedes bloquear la pantalla y guardar el móvil: la app sigue.",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="container mx-auto px-4 pt-28 pb-16 max-w-4xl">
        <div className="grid gap-10 md:grid-cols-[1fr_260px] md:items-start">
          <div>
            <h1 className="font-archivo text-4xl uppercase text-foreground mb-3">
              Descargar Camberas Track
            </h1>
            <p className="text-muted-foreground mb-5">
              La app para que te sigan en la carrera: tu familia y tus amigos ven por dónde vas,
              y la organización te tiene localizado por si te hace falta.
            </p>

            <div className="flex flex-wrap gap-2 mb-8">{botones}</div>

            {/* En el móvil, la captura va debajo de los botones; en escritorio, a la derecha */}
            <img
              src={capturaTrack}
              alt="Camberas Track en el móvil: el mapa del recorrido, el botón SOS y Activar seguimiento"
              className="md:hidden w-full max-w-[220px] mx-auto mb-8 rounded-[1.75rem] shadow-xl border border-border"
              width={480}
              height={920}
              loading="lazy"
            />

            {sistema === "android" && !ANDROID_EN_TIENDA && (
              <Card className="mb-8 border-primary/30 bg-primary/5">
                <CardContent className="pt-6 flex gap-3">
                  <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <div className="text-sm text-muted-foreground">
                    <p className="font-semibold text-foreground mb-1">
                      Android te avisará de "orígenes desconocidos"
                    </p>
                    <p>
                      Es normal: la app todavía no está en Google Play, así que se instala
                      directamente. Cuando salga el aviso, permite la instalación y continúa.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="mb-6">
              <CardContent className="pt-6 space-y-5">
                <h2 className="font-archivo uppercase text-lg text-foreground">Cómo se usa</h2>
                <ol className="space-y-4 list-none p-0 m-0">
                  {pasos.map((paso, i) => (
                    <li key={paso.titulo} className="flex gap-3">
                      <span className="h-7 w-7 shrink-0 rounded-full bg-primary text-primary-foreground font-archivo text-sm flex items-center justify-center">
                        {i + 1}
                      </span>
                      <p className="text-sm text-muted-foreground">
                        <strong className="text-foreground">{paso.titulo}.</strong> {paso.texto}
                      </p>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6 space-y-5">
                <h2 className="font-archivo uppercase text-lg text-foreground">Qué hace la app</h2>

                <div className="flex gap-3">
                  <MapPin className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <p className="text-sm text-muted-foreground">
                    <strong className="text-foreground">Te siguen en directo.</strong> Mientras
                    tienes el seguimiento activado, tu posición sale en el mapa de la carrera en
                    camberas.com. Los tuyos te ven avanzar y saben cuándo esperarte en meta.
                  </p>
                </div>

                <div className="flex gap-3">
                  <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <p className="text-sm text-muted-foreground">
                    <strong className="text-foreground">Botón SOS.</strong> Si te pasa algo, un
                    toque largo avisa a la organización con tu posición exacta. Para una
                    emergencia real, siempre el 112.
                  </p>
                </div>

                <div className="flex gap-3">
                  <WifiOff className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <p className="text-sm text-muted-foreground">
                    <strong className="text-foreground">Sin cobertura también.</strong> Guarda el
                    recorrido en el móvil y lo envía cuando vuelve la señal. No se pierde ni un
                    metro.
                  </p>
                </div>

                <div className="pt-4 border-t text-sm text-muted-foreground">
                  <p className="font-semibold text-foreground mb-1">Tu privacidad</p>
                  <p>
                    Abrir la app no enciende el GPS: el seguimiento solo empieza cuando tú pulsas
                    Activar seguimiento, y se detiene solo al terminar la carrera. No pedimos
                    nombre, correo ni teléfono: tu dorsal es toda tu identidad.
                  </p>
                </div>
              </CardContent>
            </Card>

            <p className="text-center md:text-left text-sm text-muted-foreground mt-8">
              ¿Ya la tienes instalada? Abre el enlace del correo «Camberas Track» de tu carrera
              para activar tu dorsal.
            </p>
          </div>

          <img
            src={capturaTrack}
            alt="Camberas Track en el móvil: el mapa del recorrido, el botón SOS y Activar seguimiento"
            className="hidden md:block w-full rounded-[1.75rem] shadow-xl border border-border md:sticky md:top-28"
            width={480}
            height={920}
            loading="lazy"
          />
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Descargas;
