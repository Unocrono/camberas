/**
 * camberas.com/mi-inscripcion — «Comprueba tu inscripción» del menú.
 *
 * Sin elegir carrera: con el documento y el email (o la fecha de
 * nacimiento), el corredor ve sus inscripciones en todas las carreras
 * próximas y del último mes, y puede pedirse una copia de cada una. Dentro de
 * cada carrera está la misma consulta limitada a ella (?consulta=1).
 */
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConsultaInscripcionPanel } from "@/components/ConsultaInscripcionDialog";
import { SearchCheck } from "lucide-react";

const MiInscripcion = () => (
  <div className="min-h-screen flex flex-col">
    <Navbar />
    <main className="flex-1 container mx-auto px-4 pt-24 pb-12 max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SearchCheck className="h-5 w-5 text-primary" />
            Comprueba tu inscripción
          </CardTitle>
          <CardDescription>
            Escribe tu documento y el email con el que te inscribiste (o tu fecha de nacimiento): te enseñamos tus
            inscripciones en las próximas carreras y puedes pedirte una copia por email.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ConsultaInscripcionPanel />
        </CardContent>
      </Card>
    </main>
    <Footer />
  </div>
);

export default MiInscripcion;
