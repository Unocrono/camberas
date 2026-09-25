import { PaginaSecundaria, TituloInterior } from "./PaginaSecundaria";

/**
 * Aviso legal, privacidad y cookies de la web de la carrera, con el
 * organizador como responsable del tratamiento y UNO/Camberas como encargado
 * (inscripciones, pagos, cronometraje). Los datos del organizador salen de
 * race_web.contenido.organizador; si faltan, se usa el nombre y el email.
 */
export default function PaginaLegal() {
  return (
    <PaginaSecundaria titulo="Aviso legal">
      {(evento, rutas) => {
        const o = evento.organizador ?? {};
        const responsable = o.razonSocial ?? o.nombre ?? evento.nombre;
        const email = o.email ?? evento.contacto?.email;
        return (
          <>
            <TituloInterior etiqueta="Legal" titulo="Aviso legal y privacidad" rutas={rutas} />
            <div className="mx-auto flex max-w-[900px] flex-col gap-8 px-5 pb-16 pt-10 text-[15px] leading-relaxed lg:px-[72px] lg:pb-24">
              <section id="aviso-legal" className="wp-card p-[22px] lg:p-8">
                <h2 className="text-[24px] lg:text-[28px]">Aviso legal</h2>
                <p className="mt-4">
                  Esta web es la página oficial de <strong style={{ color: "var(--wp-ink)" }}>{evento.nombre}</strong>, organizada por{" "}
                  <strong style={{ color: "var(--wp-ink)" }}>{responsable}</strong>
                  {o.cif ? ` (CIF ${o.cif})` : ""}
                  {o.direccion ? `, con domicilio en ${o.direccion}` : ""}.
                  {email ? ` Contacto: ${email}.` : ""}
                </p>
                <p className="mt-3">
                  La plataforma de inscripciones, cobro, cronometraje y resultados es Camberas (UNO Cronometraje S.L., Guevara 28 bajo, Santander), que actúa por cuenta del organizador.
                </p>
              </section>

              <section id="privacidad" className="wp-card p-[22px] lg:p-8">
                <h2 className="text-[24px] lg:text-[28px]">Protección de datos</h2>
                <p className="mt-4">
                  <strong style={{ color: "var(--wp-ink)" }}>Responsable del tratamiento:</strong> {responsable}
                  {email ? ` (${email})` : ""}. <strong style={{ color: "var(--wp-ink)" }}>Encargado del tratamiento:</strong> UNO Cronometraje S.L. (Camberas), que gestiona las inscripciones, el cobro, el cronometraje y la publicación de resultados por cuenta del organizador.
                </p>
                <p className="mt-3">
                  <strong style={{ color: "var(--wp-ink)" }}>Finalidad:</strong> gestionar tu inscripción y participación en la prueba (dorsal, categoría, clasificación, seguro de accidentes, comunicaciones sobre la carrera) y, si lo autorizas, enviarte información de próximas ediciones.{" "}
                  <strong style={{ color: "var(--wp-ink)" }}>Base jurídica:</strong> la ejecución del contrato de inscripción y el consentimiento para las comunicaciones opcionales.{" "}
                  <strong style={{ color: "var(--wp-ink)" }}>Destinatarios:</strong> la compañía aseguradora de la prueba, la federación cuando la carrera esté federada, y la entidad bancaria para el cobro; no se ceden datos a terceros con otros fines.{" "}
                  <strong style={{ color: "var(--wp-ink)" }}>Conservación:</strong> mientras dure la relación y los plazos legales; las clasificaciones se publican con nombre, dorsal, club y tiempos.
                </p>
                <p className="mt-3">
                  <strong style={{ color: "var(--wp-ink)" }}>Derechos:</strong> puedes acceder, rectificar, suprimir, limitar u oponerte al tratamiento y solicitar la portabilidad escribiendo a {email ?? "la organización"}
                  {evento.contacto?.emailDatos ? ` o a ${evento.contacto.emailDatos}` : ""}. También puedes reclamar ante la Agencia Española de Protección de Datos (aepd.es).
                </p>
                <p className="mt-3">
                  <strong style={{ color: "var(--wp-ink)" }}>Imagen:</strong> durante la prueba se toman fotografías y vídeo que pueden publicarse en la web y redes de la carrera; al inscribirte lo aceptas, sin perjuicio de tu derecho a oponerte.
                </p>
              </section>

              <section id="cookies" className="wp-card p-[22px] lg:p-8">
                <h2 className="text-[24px] lg:text-[28px]">Cookies</h2>
                <p className="mt-4">
                  Esta web utiliza únicamente almacenamiento técnico imprescindible para funcionar (recordar el estado de la página y las preferencias de la sesión). No usa cookies de seguimiento ni publicidad.
                  {evento.analytics?.ga4 ? " La analítica de visitas solo se activa si la aceptas en el aviso al entrar." : ""}
                </p>
              </section>
            </div>
          </>
        );
      }}
    </PaginaSecundaria>
  );
}
