import { useTenant } from "@/tenant/TenantContext";

/** 404 de la web de la carrera (sin el marco de Camberas) */
export default function NoEncontradoWeb() {
  const { modo, tenant, urlCamberas } = useTenant();
  const inicio = modo === "propia" ? "/" : "/races";
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-5 text-center" style={{ background: "#f4f5f0", color: "#4a5540", fontFamily: "'Barlow', 'Helvetica Neue', Arial, sans-serif" }}>
      <p className="text-[12px] font-semibold uppercase" style={{ letterSpacing: 2, color: "#3f6a12" }}>Error 404</p>
      <h1 className="mt-3 text-[48px] font-extrabold uppercase leading-none" style={{ color: "#1a2414" }}>
        Esta página no existe
      </h1>
      <p className="mt-4 max-w-md">
        {tenant ? `Vuelve a la web de ${tenant.nombre}.` : "La carrera que buscas no está publicada o la dirección no es correcta."}
      </p>
      <a href={inicio} className="mt-8 inline-flex min-h-[52px] items-center rounded-[10px] px-6 text-lg font-extrabold uppercase no-underline" style={{ background: "#8bc34a", color: "#0f1a08" }}>
        {tenant ? "Ir a la portada" : "Ver carreras"}
      </a>
      {modo === "propia" && (
        <a href={urlCamberas("/races")} className="mt-4 text-sm underline" style={{ color: "#4a5540" }}>
          Otras carreras en Camberas
        </a>
      )}
    </div>
  );
}
