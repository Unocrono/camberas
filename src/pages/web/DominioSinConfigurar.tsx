/**
 * Un dominio ha llegado a Camberas (CNAME) pero no está dado de alta o
 * verificado en race_domains. No se sirve la app de Camberas bajo un dominio
 * ajeno: se explica qué falta.
 */
export default function DominioSinConfigurar() {
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-5 text-center" style={{ background: "#f4f5f0", color: "#4a5540", fontFamily: "'Barlow', 'Helvetica Neue', Arial, sans-serif" }}>
      <p className="text-[12px] font-semibold uppercase" style={{ letterSpacing: 2, color: "#3f6a12" }}>Camberas</p>
      <h1 className="mt-3 text-[40px] font-extrabold uppercase leading-none" style={{ color: "#1a2414" }}>
        Este dominio aún no tiene web
      </h1>
      <p className="mt-4 max-w-md">
        <strong>{host}</strong> apunta a Camberas, pero no está asignado a ninguna carrera o todavía no se ha verificado. Si es tu carrera, entra en el panel del organizador, Web propia › Dominio, y pulsa «Comprobar DNS».
      </p>
      <a href="https://camberas.com/races" className="mt-8 inline-flex min-h-[52px] items-center rounded-[10px] px-6 text-lg font-extrabold uppercase no-underline" style={{ background: "#8bc34a", color: "#0f1a08" }}>
        Ver carreras en Camberas
      </a>
    </div>
  );
}
