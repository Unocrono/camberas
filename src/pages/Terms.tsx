import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollText } from "lucide-react";

const Terms = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="flex items-center gap-3 mb-8">
          <ScrollText className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">Términos y Condiciones</h1>
        </div>

        <Card className="mb-8">
          <CardContent className="pt-6 prose prose-sm max-w-none dark:prose-invert">
            <p className="text-muted-foreground text-sm mb-6">
              Última actualización: 4 de diciembre de 2025
            </p>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">1. Generalidades</h2>
              <p className="text-muted-foreground">
                Las presentes condiciones generales regulan el uso de la plataforma Camberas (en adelante, "la Plataforma"), accesible a través de camberas.com, así como los productos y servicios que se ofrecen a través de la misma.
              </p>
              <ul className="list-none space-y-2 text-muted-foreground mt-4">
                <li><strong>Titular:</strong> Enrique Bernardo Mazón Haya</li>
                <li><strong>NIF:</strong> 72082891V</li>
                <li><strong>Domicilio:</strong> Calle Barrionuevo, Ajalvir (Madrid)</li>
                <li><strong>Email:</strong> enrique@mazon.es</li>
              </ul>
              <p className="text-muted-foreground mt-4">
                El uso de la Plataforma implica la aceptación plena y sin reservas de las presentes condiciones generales. Si no estás de acuerdo con alguna de estas condiciones, te rogamos que no utilices la Plataforma.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">2. Objeto</h2>
              <p className="text-muted-foreground">
                Camberas es una plataforma tecnológica que ofrece servicios de:
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground mt-2">
                <li>Gestión de inscripciones a carreras y eventos deportivos</li>
                <li>Cronometraje profesional de carreras</li>
                <li>Publicación de resultados y clasificaciones</li>
                <li>Seguimiento GPS en tiempo real de participantes</li>
                <li>Herramientas de gestión para organizadores de eventos</li>
                <li>Alquiler de equipos de cronometraje</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">3. Registro de Usuarios</h2>
              
              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">3.1 Requisitos</h3>
              <p className="text-muted-foreground">
                Para utilizar ciertos servicios de la Plataforma es necesario registrarse como usuario. La edad mínima para registrarse es de 18 años. Los menores de 18 años podrán inscribirse en carreras únicamente con la autorización de sus padres o tutores legales.
              </p>

              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">3.2 Veracidad de los datos</h3>
              <p className="text-muted-foreground">
                El usuario se compromete a proporcionar información veraz, exacta y completa en el proceso de registro y a mantener dicha información actualizada. Camberas no se hace responsable de la veracidad de los datos proporcionados por los usuarios.
              </p>

              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">3.3 Seguridad de la cuenta</h3>
              <p className="text-muted-foreground">
                El usuario es responsable de mantener la confidencialidad de sus credenciales de acceso y de todas las actividades que se realicen bajo su cuenta.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">4. Inscripciones a Carreras</h2>
              
              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">4.1 Proceso de inscripción</h3>
              <p className="text-muted-foreground">
                Las inscripciones se realizan a través de la Plataforma siguiendo el proceso establecido para cada evento. Al completar una inscripción, el usuario acepta las condiciones específicas del evento establecidas por el organizador.
              </p>

              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">4.2 Política de devoluciones</h3>
              <p className="text-muted-foreground font-semibold bg-muted p-4 rounded-lg">
                No hay devoluciones una vez confirmada la inscripción. El usuario acepta expresamente que, una vez confirmado el pago de la inscripción, no se realizarán devoluciones salvo en los casos expresamente previstos por el organizador del evento o por causas de fuerza mayor.
              </p>

              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">4.3 Transferencia de dorsales</h3>
              <p className="text-muted-foreground">
                La transferencia de dorsales entre participantes está sujeta a las condiciones establecidas por cada organizador. Camberas no gestiona directamente las transferencias, que deberán solicitarse al organizador del evento.
              </p>

              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">4.4 Responsabilidad del organizador</h3>
              <p className="text-muted-foreground">
                Camberas actúa como intermediario tecnológico. Los organizadores son los únicos responsables de la gestión, ejecución y cualquier incidencia relacionada con los eventos deportivos que publican en la Plataforma.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">5. Precios y Pagos</h2>
              
              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">5.1 Precios</h3>
              <p className="text-muted-foreground">
                Los precios de las inscripciones son establecidos por cada organizador y se muestran claramente antes de completar la inscripción. Los precios pueden incluir o no impuestos, según se indique.
              </p>

              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">5.2 Gastos de gestión</h3>
              <p className="text-muted-foreground">
                Camberas puede aplicar gastos de gestión por el uso de la Plataforma, que se mostrarán de forma desglosada antes de confirmar el pago.
              </p>

              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">5.3 Métodos de pago</h3>
              <p className="text-muted-foreground">
                Los pagos se realizan a través de pasarelas de pago seguras. Camberas no almacena datos de tarjetas de crédito.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">6. Obligaciones de los Usuarios</h2>
              <p className="text-muted-foreground">
                Los usuarios se comprometen a:
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground mt-2">
                <li>Utilizar la Plataforma de conformidad con la ley y las presentes condiciones</li>
                <li>Proporcionar información veraz y mantenerla actualizada</li>
                <li>No utilizar la Plataforma para actividades ilícitas o fraudulentas</li>
                <li>Respetar los derechos de propiedad intelectual</li>
                <li>No intentar acceder a áreas restringidas de la Plataforma</li>
                <li>No difundir virus o código malicioso</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">7. Condiciones para Organizadores</h2>
              
              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">7.1 Requisitos</h3>
              <p className="text-muted-foreground">
                Los organizadores que deseen publicar eventos en la Plataforma deberán solicitar la aprobación de su cuenta como organizador, proporcionando la información requerida.
              </p>

              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">7.2 Responsabilidades</h3>
              <p className="text-muted-foreground">
                Los organizadores son responsables de:
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground mt-2">
                <li>La veracidad de la información publicada sobre sus eventos</li>
                <li>La correcta ejecución de los eventos</li>
                <li>El cumplimiento de la normativa aplicable (seguros, permisos, etc.)</li>
                <li>La gestión de los datos de los participantes conforme al RGPD</li>
                <li>La atención a las reclamaciones de los participantes</li>
              </ul>

              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">7.3 Acceso a datos</h3>
              <p className="text-muted-foreground">
                Los organizadores pueden acceder únicamente a los datos de los participantes inscritos en sus propias carreras. El organizador es considerado responsable del tratamiento de dichos datos para la gestión del evento.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">8. Servicios de Cronometraje y GPS</h2>
              
              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">8.1 Cronometraje</h3>
              <p className="text-muted-foreground">
                Camberas ofrece servicios de cronometraje profesional para eventos. Los tiempos registrados son orientativos y pueden estar sujetos a revisión por parte del organizador.
              </p>

              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">8.2 Seguimiento GPS</h3>
              <p className="text-muted-foreground">
                El seguimiento GPS en vivo es un servicio opcional que requiere el consentimiento expreso del participante. Los datos de localización se utilizan únicamente para el seguimiento durante la carrera y se eliminan tras el evento.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">9. Limitación de Responsabilidad</h2>
              <p className="text-muted-foreground">
                Camberas no será responsable de:
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground mt-2">
                <li>Daños derivados de la cancelación o modificación de eventos por parte de los organizadores</li>
                <li>Lesiones o accidentes durante los eventos deportivos</li>
                <li>Errores en los tiempos o resultados publicados</li>
                <li>Interrupciones del servicio por causas técnicas</li>
                <li>Actuaciones de terceros que utilicen la Plataforma</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">10. Propiedad Intelectual</h2>
              <p className="text-muted-foreground">
                Todos los contenidos de la Plataforma (textos, imágenes, código, marcas, etc.) son propiedad de Camberas o de terceros licenciantes. Queda prohibida su reproducción, distribución o modificación sin autorización expresa.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">11. Modificaciones</h2>
              <p className="text-muted-foreground">
                Camberas se reserva el derecho a modificar estas condiciones en cualquier momento. Las modificaciones entrarán en vigor desde su publicación en la Plataforma. El uso continuado de la Plataforma tras las modificaciones implica la aceptación de las nuevas condiciones.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">12. Terminación</h2>
              <p className="text-muted-foreground">
                Camberas puede suspender o cancelar el acceso de un usuario a la Plataforma si incumple estas condiciones, sin perjuicio de las acciones legales que correspondan. El usuario puede cancelar su cuenta en cualquier momento desde su perfil.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">13. Legislación y Jurisdicción</h2>
              <p className="text-muted-foreground">
                Estas condiciones se rigen por la legislación española. Para la resolución de cualquier controversia, las partes se someten a los Juzgados y Tribunales del domicilio del usuario consumidor, o a los de Madrid en caso contrario.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">14. Contacto</h2>
              <p className="text-muted-foreground">
                Para cualquier consulta sobre estos Términos y Condiciones, puedes contactarnos en: <a href="mailto:enrique@mazon.es" className="text-primary hover:underline">enrique@mazon.es</a>
              </p>
            </section>
          </CardContent>
        </Card>
      </main>

      <Footer />
    </div>
  );
};

export default Terms;
