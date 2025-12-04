import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Shield } from "lucide-react";

const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="flex items-center gap-3 mb-8">
          <Shield className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">Política de Privacidad</h1>
        </div>

        <Card className="mb-8">
          <CardContent className="pt-6 prose prose-sm max-w-none dark:prose-invert">
            <p className="text-muted-foreground text-sm mb-6">
              Última actualización: 4 de diciembre de 2025
            </p>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">1. Responsable del Tratamiento</h2>
              <p className="text-muted-foreground">
                En cumplimiento del Reglamento (UE) 2016/679 del Parlamento Europeo y del Consejo (RGPD) y la Ley Orgánica 3/2018, de 5 de diciembre, de Protección de Datos Personales y garantía de los derechos digitales (LOPDGDD), te informamos de lo siguiente:
              </p>
              <ul className="list-none space-y-2 text-muted-foreground mt-4">
                <li><strong>Responsable:</strong> Enrique Bernardo Mazón Haya</li>
                <li><strong>NIF:</strong> 72082891V</li>
                <li><strong>Domicilio:</strong> Calle Barrionuevo, Ajalvir (Madrid)</li>
                <li><strong>Email:</strong> enrique@mazon.es</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">2. Datos que Recopilamos</h2>
              <p className="text-muted-foreground">
                En Camberas podemos recopilar los siguientes datos personales:
              </p>
              
              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">2.1 Datos de registro de usuarios</h3>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>Nombre y apellidos</li>
                <li>Dirección de correo electrónico</li>
                <li>Número de teléfono</li>
                <li>Fecha de nacimiento</li>
                <li>DNI/Pasaporte</li>
                <li>Dirección postal</li>
                <li>Género</li>
              </ul>

              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">2.2 Datos de inscripción a carreras</h3>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>Club o equipo deportivo</li>
                <li>Talla de camiseta</li>
                <li>Contacto de emergencia</li>
                <li>Información médica relevante (alergias, condiciones)</li>
                <li>Licencia federativa (si aplica)</li>
              </ul>

              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">2.3 Datos de organizadores</h3>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>Nombre del club/empresa</li>
                <li>Datos de facturación</li>
                <li>Información de contacto profesional</li>
              </ul>

              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">2.4 Datos técnicos</h3>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>Dirección IP</li>
                <li>Tipo de navegador y dispositivo</li>
                <li>Datos de geolocalización (solo si activas el seguimiento GPS)</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">3. Finalidades del Tratamiento</h2>
              <p className="text-muted-foreground">
                Tratamos tus datos personales para las siguientes finalidades:
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground mt-2">
                <li><strong>Gestión de cuenta:</strong> Crear y administrar tu cuenta de usuario en la plataforma</li>
                <li><strong>Inscripciones:</strong> Procesar tus inscripciones a carreras y eventos deportivos</li>
                <li><strong>Cronometraje:</strong> Registrar y publicar tus tiempos y resultados</li>
                <li><strong>Seguimiento GPS:</strong> Permitir el seguimiento en vivo durante las carreras (previo consentimiento)</li>
                <li><strong>Comunicaciones:</strong> Enviarte información sobre tus inscripciones, cambios en los eventos y avisos importantes</li>
                <li><strong>Mejora del servicio:</strong> Analizar el uso de la plataforma para mejorar nuestros servicios</li>
                <li><strong>Cumplimiento legal:</strong> Atender obligaciones legales y requerimientos de autoridades</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">4. Legitimación del Tratamiento</h2>
              <p className="text-muted-foreground">
                La base legal para el tratamiento de tus datos es:
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground mt-2">
                <li><strong>Ejecución de contrato:</strong> Para gestionar tu registro, inscripciones y participación en carreras</li>
                <li><strong>Consentimiento:</strong> Para el envío de comunicaciones comerciales y el seguimiento GPS</li>
                <li><strong>Interés legítimo:</strong> Para mejorar nuestros servicios y prevenir el fraude</li>
                <li><strong>Obligación legal:</strong> Para cumplir con obligaciones fiscales y legales</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">5. Destinatarios de los Datos</h2>
              <p className="text-muted-foreground">
                Tus datos personales podrán ser comunicados a:
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground mt-2">
                <li><strong>Organizadores de carreras:</strong> Los organizadores de los eventos en los que te inscribas tendrán acceso a los datos necesarios para la gestión de la carrera. El organizador es responsable de los datos de sus propias carreras y solo puede acceder a los datos de los participantes inscritos en eventos que él gestiona</li>
                <li><strong>Proveedores de servicios:</strong> Empresas que nos prestan servicios técnicos (hosting, envío de emails, procesamiento de pagos)</li>
                <li><strong>Autoridades:</strong> Cuando sea requerido por ley o para proteger nuestros derechos</li>
              </ul>
              <p className="text-muted-foreground mt-4">
                No vendemos ni cedemos tus datos personales a terceros con fines comerciales.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">6. Conservación de los Datos</h2>
              <p className="text-muted-foreground">
                Conservamos tus datos personales durante el tiempo necesario para cumplir con las finalidades para las que fueron recogidos:
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground mt-2">
                <li><strong>Datos de cuenta:</strong> Mientras mantengas tu cuenta activa</li>
                <li><strong>Datos de inscripciones:</strong> 5 años desde la fecha de la carrera</li>
                <li><strong>Resultados y tiempos:</strong> De forma indefinida para histórico deportivo</li>
                <li><strong>Datos de facturación:</strong> 6 años según obligaciones fiscales</li>
                <li><strong>Datos de GPS:</strong> 30 días desde la carrera</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">7. Derechos del Usuario</h2>
              <p className="text-muted-foreground">
                Puedes ejercer los siguientes derechos en relación con tus datos personales:
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground mt-2">
                <li><strong>Acceso:</strong> Conocer qué datos tenemos sobre ti</li>
                <li><strong>Rectificación:</strong> Corregir datos inexactos o incompletos</li>
                <li><strong>Supresión:</strong> Solicitar la eliminación de tus datos</li>
                <li><strong>Oposición:</strong> Oponerte al tratamiento de tus datos</li>
                <li><strong>Limitación:</strong> Solicitar la limitación del tratamiento</li>
                <li><strong>Portabilidad:</strong> Recibir tus datos en formato estructurado</li>
              </ul>
              <p className="text-muted-foreground mt-4">
                Para ejercer estos derechos, puedes contactarnos en: <a href="mailto:enrique@mazon.es" className="text-primary hover:underline">enrique@mazon.es</a>
              </p>
              <p className="text-muted-foreground mt-2">
                También tienes derecho a presentar una reclamación ante la Agencia Española de Protección de Datos (AEPD) si consideras que tus derechos han sido vulnerados: <a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">www.aepd.es</a>
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">8. Menores de Edad</h2>
              <p className="text-muted-foreground">
                La edad mínima para registrarse en Camberas es de 18 años. Los menores de 18 años pueden inscribirse en carreras únicamente con la autorización expresa de sus padres o tutores legales, quienes serán responsables de los datos facilitados.
              </p>
              <p className="text-muted-foreground mt-2">
                No recopilamos conscientemente datos de menores de 14 años sin el consentimiento de sus padres o tutores.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">9. Seguridad de los Datos</h2>
              <p className="text-muted-foreground">
                Hemos implementado medidas técnicas y organizativas apropiadas para proteger tus datos personales contra el acceso no autorizado, la alteración, divulgación o destrucción. Estas medidas incluyen:
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground mt-2">
                <li>Cifrado de datos en tránsito (HTTPS/TLS)</li>
                <li>Cifrado de datos en reposo</li>
                <li>Control de acceso basado en roles</li>
                <li>Monitorización y auditoría de accesos</li>
                <li>Copias de seguridad regulares</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">10. Modificaciones</h2>
              <p className="text-muted-foreground">
                Nos reservamos el derecho a modificar esta Política de Privacidad para adaptarla a novedades legislativas o cambios en nuestros servicios. Te notificaremos cualquier cambio significativo a través de la plataforma o por email.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">11. Contacto</h2>
              <p className="text-muted-foreground">
                Para cualquier consulta relacionada con esta Política de Privacidad o el tratamiento de tus datos, puedes contactarnos en: <a href="mailto:enrique@mazon.es" className="text-primary hover:underline">enrique@mazon.es</a>
              </p>
            </section>
          </CardContent>
        </Card>
      </main>

      <Footer />
    </div>
  );
};

export default PrivacyPolicy;
