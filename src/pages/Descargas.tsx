/**
 * camberas.com/descargas — la puerta única para instalar Camberas Track.
 *
 * Nace de un enlace de WhatsApp: pasar una URL cruda de GitHub a un grupo
 * de ciclistas queda feo y además obliga a explicar cuál toca según el
 * móvil. Aquí se detecta el sistema y se enseña primero el botón que le
 * sirve a quien mira, con el otro a mano por si comparte pantalla.
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
import { Apple, Smartphone, ShieldCheck, MapPin, WifiOff, Info } from "lucide-react";

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
    <Button
      key="ios"
      size="lg"
      variant={destacado ? "default" : "outline"}
      className="w-full h-auto py-4"
      asChild
    >
      <a href={IOS_URL} target="_blank" rel="noopener noreferrer">
        <Apple className="h-5 w-5 mr-3" />
        <span className="text-left">
          <span className="block font-semibold">iPhone y iPad</span>
          <span className="block text-xs opacity-80">Descargar en la App Store</span>
        </span>
      </a>
    </Button>
  );

  const botonAndroid = (destacado: boolean) => (
    <Button
      key="android"
      size="lg"
      variant={destacado ? "default" : "outline"}
      className="w-full h-auto py-4"
      asChild
    >
      <a href={ANDROID_URL} target="_blank" rel="noopener noreferrer">
        <Smartphone className="h-5 w-5 mr-3" />
        <span className="text-left">
          <span className="block font-semibold">Android</span>
          <span className="block text-xs opacity-80">
            {ANDROID_EN_TIENDA ? "Descargar en Google Play" : "Descargar la app (93 MB)"}
          </span>
        </span>
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

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="container mx-auto px-4 pt-28 pb-16 max-w-2xl">
        <div className="text-center mb-10">
          <h1 className="font-archivo text-4xl uppercase text-foreground mb-3">
            Descargar Camberas Track
          </h1>
          <p className="text-muted-foreground">
            La app que te mantiene en el mapa de tu salida. Gratis, sin registro y sin publicidad.
          </p>
        </div>

        <div className="space-y-3 mb-8">{botones}</div>

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

        <Card>
          <CardContent className="pt-6 space-y-5">
            <h2 className="font-archivo uppercase text-lg text-foreground">Qué hace la app</h2>

            <div className="flex gap-3">
              <MapPin className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <p className="text-sm text-muted-foreground">
                <strong className="text-foreground">Todos en el mismo mapa.</strong> Mientras tienes
                el seguimiento activado, los tuyos ven dónde estás y tú dónde están ellos.
              </p>
            </div>

            <div className="flex gap-3">
              <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <p className="text-sm text-muted-foreground">
                <strong className="text-foreground">Botón SOS.</strong> Si te pasa algo, un toque
                largo avisa con tu posición exacta. Para una emergencia real, siempre el 112.
              </p>
            </div>

            <div className="flex gap-3">
              <WifiOff className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <p className="text-sm text-muted-foreground">
                <strong className="text-foreground">Sin cobertura también.</strong> Guarda el
                recorrido en el móvil y lo envía cuando vuelve la señal. No se pierde ni un metro.
              </p>
            </div>

            <div className="pt-4 border-t text-sm text-muted-foreground">
              <p className="font-semibold text-foreground mb-1">Tu privacidad</p>
              <p>
                Abrir la app no enciende el GPS: el seguimiento solo empieza cuando tú lo activas, y
                se detiene solo al terminar la salida. No pedimos nombre, correo ni teléfono — tu
                dorsal es toda tu identidad.
              </p>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-8">
          ¿Ya la tienes instalada? Entra en tu salida con el enlace que te haya pasado tu
          organizador o el capo de tu grupetta.
        </p>
      </main>

      <Footer />
    </div>
  );
};

export default Descargas;
