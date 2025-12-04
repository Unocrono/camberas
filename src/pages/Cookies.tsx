import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Cookie } from "lucide-react";

const Cookies = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="flex items-center gap-3 mb-8">
          <Cookie className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">Política de Cookies</h1>
        </div>

        <Card className="mb-8">
          <CardContent className="pt-6 prose prose-sm max-w-none dark:prose-invert">
            <p className="text-muted-foreground text-sm mb-6">
              Última actualización: 4 de diciembre de 2025
            </p>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">1. ¿Qué son las Cookies?</h2>
              <p className="text-muted-foreground">
                En cumplimiento de la Ley 34/2002, de 11 de julio, de Servicios de la Sociedad de la Información y de Comercio Electrónico (LSSI-CE), te informamos que una cookie es un pequeño archivo de texto que se almacena en tu navegador cuando visitas una página web.
              </p>
              <p className="text-muted-foreground mt-4">
                Las cookies permiten a una página web, entre otras cosas, almacenar y recuperar información sobre los hábitos de navegación de un usuario o de su equipo y, dependiendo de la información que contengan y de la forma en que utilice su equipo, pueden utilizarse para reconocer al usuario.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">2. Responsable del Uso de Cookies</h2>
              <p className="text-muted-foreground">
                Esta política de cookies es aplicable al sitio web camberas.com y sus subdominios:
              </p>
              <ul className="list-none space-y-2 text-muted-foreground mt-4">
                <li><strong>Responsable:</strong> Enrique Bernardo Mazón Haya</li>
                <li><strong>NIF:</strong> 72082891V</li>
                <li><strong>Domicilio:</strong> Calle Barrionuevo, Ajalvir (Madrid)</li>
                <li><strong>Email:</strong> enrique@mazon.es</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">3. Tipos de Cookies</h2>
              
              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">3.1 Según su gestión</h3>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                <li><strong>Cookies propias:</strong> Son aquellas que se envían al equipo del usuario desde un equipo o dominio gestionado por el propio editor</li>
                <li><strong>Cookies de terceros:</strong> Son aquellas que se envían al equipo del usuario desde un equipo o dominio que no es gestionado por el editor, sino por otra entidad</li>
              </ul>

              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">3.2 Según el tiempo de almacenamiento</h3>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                <li><strong>Cookies de sesión:</strong> Recogen y almacenan datos mientras el usuario accede a una web. Se eliminan al cerrar el navegador</li>
                <li><strong>Cookies persistentes:</strong> Los datos siguen almacenados durante un período definido por el responsable de la cookie</li>
              </ul>

              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">3.3 Según su finalidad</h3>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                <li><strong>Cookies técnicas o necesarias:</strong> Permiten la navegación y el uso de las diferentes opciones o servicios que ofrece la web</li>
                <li><strong>Cookies de análisis o medición:</strong> Permiten cuantificar el número de usuarios y realizar la medición y análisis estadístico</li>
                <li><strong>Cookies de preferencia o personalización:</strong> Permiten recordar información para que el usuario acceda al servicio con determinadas características</li>
                <li><strong>Cookies de publicidad:</strong> Permiten gestionar los espacios publicitarios de forma eficaz</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">4. Cookies Utilizadas en Camberas</h2>
              <p className="text-muted-foreground mb-4">
                A continuación, se detallan las cookies que utilizamos en nuestra plataforma:
              </p>

              <div className="overflow-x-auto">
                <table className="min-w-full border border-border rounded-lg">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-4 py-2 text-left text-foreground font-medium">Cookie</th>
                      <th className="px-4 py-2 text-left text-foreground font-medium">Tipo</th>
                      <th className="px-4 py-2 text-left text-foreground font-medium">Finalidad</th>
                      <th className="px-4 py-2 text-left text-foreground font-medium">Duración</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    <tr>
                      <td className="px-4 py-2 text-muted-foreground">sb-*-auth-token</td>
                      <td className="px-4 py-2 text-muted-foreground">Propia / Técnica</td>
                      <td className="px-4 py-2 text-muted-foreground">Autenticación y sesión de usuario</td>
                      <td className="px-4 py-2 text-muted-foreground">Sesión</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 text-muted-foreground">theme</td>
                      <td className="px-4 py-2 text-muted-foreground">Propia / Preferencia</td>
                      <td className="px-4 py-2 text-muted-foreground">Recordar preferencia de tema (claro/oscuro)</td>
                      <td className="px-4 py-2 text-muted-foreground">1 año</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 text-muted-foreground">timing_session</td>
                      <td className="px-4 py-2 text-muted-foreground">Propia / Técnica</td>
                      <td className="px-4 py-2 text-muted-foreground">Sesión de la app de cronometraje</td>
                      <td className="px-4 py-2 text-muted-foreground">5 días</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h3 className="text-lg font-medium text-foreground mt-6 mb-2">4.1 Cookies de Google Analytics (Terceros)</h3>
              <p className="text-muted-foreground">
                Utilizamos Google Analytics, un servicio analítico de web prestado por Google, Inc., para analizar el uso que hacen los usuarios del sitio web. Google Analytics utiliza cookies para generar información sobre tu visita que será transmitida y archivada por Google.
              </p>
              
              <div className="overflow-x-auto mt-4">
                <table className="min-w-full border border-border rounded-lg">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-4 py-2 text-left text-foreground font-medium">Cookie</th>
                      <th className="px-4 py-2 text-left text-foreground font-medium">Finalidad</th>
                      <th className="px-4 py-2 text-left text-foreground font-medium">Duración</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    <tr>
                      <td className="px-4 py-2 text-muted-foreground">_ga</td>
                      <td className="px-4 py-2 text-muted-foreground">Distinguir usuarios únicos</td>
                      <td className="px-4 py-2 text-muted-foreground">2 años</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 text-muted-foreground">_ga_*</td>
                      <td className="px-4 py-2 text-muted-foreground">Mantener estado de sesión</td>
                      <td className="px-4 py-2 text-muted-foreground">2 años</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 text-muted-foreground">_gid</td>
                      <td className="px-4 py-2 text-muted-foreground">Distinguir usuarios</td>
                      <td className="px-4 py-2 text-muted-foreground">24 horas</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 text-muted-foreground">_gat</td>
                      <td className="px-4 py-2 text-muted-foreground">Limitar el porcentaje de solicitudes</td>
                      <td className="px-4 py-2 text-muted-foreground">1 minuto</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <p className="text-muted-foreground mt-4">
                Puedes obtener más información sobre las cookies de Google Analytics en: <a href="https://policies.google.com/technologies/cookies" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">https://policies.google.com/technologies/cookies</a>
              </p>
              <p className="text-muted-foreground mt-2">
                Puedes desactivar las cookies de Google Analytics a través del siguiente enlace: <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">https://tools.google.com/dlpage/gaoptout</a>
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">5. Cookies Exceptuadas del Consentimiento</h2>
              <p className="text-muted-foreground">
                Según el artículo 22.2 de la LSSI-CE, las siguientes cookies están exceptuadas del deber de obtener consentimiento:
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground mt-2">
                <li>Cookies de "entrada del usuario"</li>
                <li>Cookies de autenticación o identificación de usuario (únicamente de sesión)</li>
                <li>Cookies de seguridad del usuario</li>
                <li>Cookies de sesión de reproductor multimedia</li>
                <li>Cookies de sesión para equilibrar la carga</li>
                <li>Cookies de personalización de la interfaz de usuario</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">6. Cómo Gestionar las Cookies</h2>
              <p className="text-muted-foreground">
                Puedes permitir, bloquear o eliminar las cookies instaladas en tu equipo mediante la configuración de las opciones del navegador instalado en tu ordenador:
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground mt-4">
                <li>
                  <strong>Google Chrome:</strong>{" "}
                  <a href="https://support.google.com/chrome/answer/95647" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    support.google.com/chrome/answer/95647
                  </a>
                </li>
                <li>
                  <strong>Mozilla Firefox:</strong>{" "}
                  <a href="https://support.mozilla.org/es/kb/habilitar-y-deshabilitar-cookies-sitios-web-rastrear-preferencias" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    support.mozilla.org/es/kb/cookies
                  </a>
                </li>
                <li>
                  <strong>Microsoft Edge:</strong>{" "}
                  <a href="https://support.microsoft.com/es-es/microsoft-edge/eliminar-las-cookies-en-microsoft-edge-63947406-40ac-c3b8-57b9-2a946a29ae09" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    support.microsoft.com
                  </a>
                </li>
                <li>
                  <strong>Safari:</strong>{" "}
                  <a href="https://support.apple.com/es-es/guide/safari/sfri11471/mac" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    support.apple.com
                  </a>
                </li>
                <li>
                  <strong>Opera:</strong>{" "}
                  <a href="https://help.opera.com/en/latest/web-preferences/#cookies" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    help.opera.com
                  </a>
                </li>
              </ul>
              <p className="text-muted-foreground mt-4">
                <strong>Nota importante:</strong> Si desactivas las cookies, es posible que no puedas hacer uso de todas las funcionalidades de la web. Por ejemplo, no podrás iniciar sesión o utilizar ciertas características interactivas.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">7. Tratamiento de Datos</h2>
              <p className="text-muted-foreground">
                Camberas guarda toda la información recogida a través de las cookies en un formato no personalizado (dirección IP anonimizada cuando es posible). Esta información no será revelada a terceros salvo en aquellos casos previstos por la ley.
              </p>
              <p className="text-muted-foreground mt-4">
                Para más información sobre el uso de tus datos, consulta nuestra <a href="/privacy-policy" className="text-primary hover:underline">Política de Privacidad</a>.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">8. Actualizaciones de esta Política</h2>
              <p className="text-muted-foreground">
                Nos reservamos el derecho de modificar esta Política de Cookies en función de exigencias legislativas o para adaptarla a nuevas funcionalidades de la web. Por ello, te recomendamos revisar esta política periódicamente.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">9. Más Información</h2>
              <p className="text-muted-foreground">
                Para más información sobre cookies y tus derechos como usuario, puedes consultar la Guía sobre el uso de cookies elaborada por la Agencia Española de Protección de Datos:{" "}
                <a href="https://www.aepd.es/guias/guia-cookies.pdf" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  www.aepd.es/guias/guia-cookies.pdf
                </a>
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">10. Contacto</h2>
              <p className="text-muted-foreground">
                Si tienes dudas sobre esta Política de Cookies, puedes contactar con nosotros en: <a href="mailto:enrique@mazon.es" className="text-primary hover:underline">enrique@mazon.es</a>
              </p>
            </section>
          </CardContent>
        </Card>
      </main>

      <Footer />
    </div>
  );
};

export default Cookies;
