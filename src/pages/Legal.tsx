import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { FileText } from "lucide-react";

const Legal = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="flex items-center gap-3 mb-8">
          <FileText className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">Aviso Legal</h1>
        </div>

        <Card className="mb-8">
          <CardContent className="pt-6 prose prose-sm max-w-none dark:prose-invert">
            <p className="text-muted-foreground text-sm mb-6">
              Última actualización: 4 de diciembre de 2025
            </p>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">1. Identificación del Titular</h2>
              <p className="text-muted-foreground">
                En cumplimiento de lo establecido en la Ley 34/2002, de 11 de julio, de Servicios de la Sociedad de la Información y del Comercio Electrónico (LSSI-CE), se informa que este sitio web es propiedad de:
              </p>
              <ul className="list-none space-y-2 text-muted-foreground mt-4">
                <li><strong>Titular:</strong> Enrique Bernardo Mazón Haya</li>
                <li><strong>NIF:</strong> 72082891V</li>
                <li><strong>Domicilio:</strong> Calle Barrionuevo, Ajalvir (Madrid)</li>
                <li><strong>Email de contacto:</strong> enrique@mazon.es</li>
                <li><strong>Sitio web:</strong> https://camberas.com</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">2. Objeto y Ámbito de Aplicación</h2>
              <p className="text-muted-foreground">
                El presente Aviso Legal regula el uso del sitio web camberas.com (en adelante, "la Plataforma"), así como de sus subdominios y aplicaciones asociadas. La Plataforma tiene como finalidad principal ofrecer servicios de gestión de inscripciones, cronometraje y seguimiento para carreras de montaña, trail running y ciclismo de montaña.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">3. Condiciones de Uso</h2>
              <p className="text-muted-foreground">
                El acceso y uso de la Plataforma atribuye la condición de Usuario e implica la aceptación plena y sin reservas de todas las disposiciones incluidas en este Aviso Legal, así como en la Política de Privacidad, Política de Cookies y Términos y Condiciones.
              </p>
              <p className="text-muted-foreground mt-4">
                El Usuario se compromete a hacer un uso adecuado de los contenidos y servicios que Camberas ofrece, absteniéndose de:
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground mt-2">
                <li>Realizar actividades ilícitas o contrarias a la buena fe y al orden público</li>
                <li>Difundir contenidos de carácter racista, xenófobo, pornográfico, de apología del terrorismo o que atenten contra los derechos humanos</li>
                <li>Provocar daños en los sistemas físicos y lógicos de Camberas o de terceros</li>
                <li>Introducir o difundir virus informáticos o cualesquiera otros sistemas que puedan causar daños</li>
                <li>Intentar acceder y manipular las cuentas de otros usuarios</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">4. Propiedad Intelectual e Industrial</h2>
              <p className="text-muted-foreground">
                Todos los contenidos de la Plataforma, incluyendo sin carácter limitativo, textos, fotografías, gráficos, imágenes, iconos, tecnología, software, enlaces y demás contenidos audiovisuales o sonoros, así como su diseño gráfico y códigos fuente, son propiedad intelectual de Camberas o de terceros, sin que puedan entenderse cedidos al Usuario ninguno de los derechos de explotación reconocidos por la normativa vigente en materia de propiedad intelectual.
              </p>
              <p className="text-muted-foreground mt-4">
                Las marcas, nombres comerciales o signos distintivos son titularidad de Camberas o terceros, sin que pueda entenderse que el acceso a la Plataforma atribuye ningún derecho sobre los mismos.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">5. Exclusión de Garantías y Responsabilidad</h2>
              <p className="text-muted-foreground">
                Camberas no garantiza la disponibilidad continua y permanente de los servicios, quedando exonerada de cualquier responsabilidad derivada de:
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground mt-2">
                <li>Interrupciones del servicio, fallos informáticos, averías telefónicas, desconexiones, retrasos o bloqueos causados por deficiencias en las líneas y redes de telecomunicaciones</li>
                <li>Intromisiones ilegítimas mediante el uso de programas malignos de cualquier tipo y a través de cualquier medio de comunicación</li>
                <li>Uso indebido de la Plataforma por parte de los usuarios</li>
                <li>Errores de seguridad o navegación producidos por un mal funcionamiento del navegador o por el uso de versiones no actualizadas</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">6. Enlaces a Terceros</h2>
              <p className="text-muted-foreground">
                La Plataforma puede contener enlaces a sitios web de terceros. Camberas no asume ninguna responsabilidad por el contenido, veracidad o funcionamiento de dichos sitios web externos. El Usuario accede a los sitios enlazados bajo su exclusiva responsabilidad.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">7. Modificaciones</h2>
              <p className="text-muted-foreground">
                Camberas se reserva el derecho a modificar, en cualquier momento y sin previo aviso, la presentación, configuración, contenidos y estructura de la Plataforma, así como las condiciones requeridas para su acceso y/o uso.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">8. Legislación Aplicable y Jurisdicción</h2>
              <p className="text-muted-foreground">
                Las presentes condiciones se regirán por la legislación española. Para la resolución de cualquier controversia que pudiera derivarse del acceso o uso de la Plataforma, Camberas y el Usuario acuerdan someterse a los Juzgados y Tribunales del domicilio del Usuario, siempre que este tenga la condición de consumidor. En caso contrario, ambas partes se someten a los Juzgados y Tribunales de Madrid.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">9. Contacto</h2>
              <p className="text-muted-foreground">
                Para cualquier consulta relacionada con este Aviso Legal, puede contactar con nosotros a través del email: <a href="mailto:enrique@mazon.es" className="text-primary hover:underline">enrique@mazon.es</a>
              </p>
            </section>
          </CardContent>
        </Card>
      </main>

      <Footer />
    </div>
  );
};

export default Legal;
