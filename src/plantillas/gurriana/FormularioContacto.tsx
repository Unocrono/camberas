import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { EventoPublico } from "@/eventos/tipos";

/**
 * Formulario de contacto con la organización (pie de la web). Usa la función
 * contact-organizer, la misma de la ficha clásica: el email del organizador
 * se resuelve en el servidor y no llega al navegador. Quien escribe recibe
 * una copia.
 */
export function FormularioContacto({ evento }: { evento: EventoPublico }) {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [mensaje, setMensaje] = useState("");
  // Campo trampa: invisible para personas; si llega relleno, es un robot
  const [web, setWeb] = useState("");
  const [estado, setEstado] = useState<"libre" | "enviando" | "enviado" | "error">("libre");
  const [aviso, setAviso] = useState<string | null>(null);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (web) {
      setEstado("enviado");
      return;
    }
    if (mensaje.trim().length < 10) {
      setAviso("Cuéntanos un poco más: el mensaje necesita al menos 10 caracteres.");
      return;
    }
    setAviso(null);
    setEstado("enviando");
    const { error } = await supabase.functions.invoke("contact-organizer", {
      body: { raceId: evento.id, name: nombre.trim(), email: email.trim(), message: mensaje.trim() },
    });
    if (error) {
      setEstado("error");
      setAviso("No se pudo enviar. Inténtalo de nuevo en un rato o escribe al email de la organización.");
      return;
    }
    setEstado("enviado");
  };

  const campo = "w-full rounded-[10px] border bg-white px-4 py-3 text-[15px] outline-none focus:ring-2";
  const estiloCampo = { borderColor: "var(--wp-border)", color: "var(--wp-ink)" };

  if (estado === "enviado") {
    return (
      <div className="wp-card p-6 lg:p-8" style={{ color: "var(--wp-body)" }}>
        <p className="wp-display text-[24px]" style={{ color: "var(--wp-ink)" }}>Mensaje enviado</p>
        <p className="mt-3 text-[15px]">La organización te contestará a {email || "tu email"}. Te hemos mandado una copia.</p>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="wp-card flex flex-col gap-3 p-6 lg:p-8" style={{ color: "var(--wp-body)" }} noValidate={false}>
      <p className="wp-display text-[24px]" style={{ color: "var(--wp-ink)" }}>Escribe a la organización</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Nombre
          <input className={campo} style={estiloCampo} value={nombre} onChange={(e) => setNombre(e.target.value)} required minLength={2} maxLength={100} autoComplete="name" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input className={campo} style={estiloCampo} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={255} autoComplete="email" />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        Mensaje
        <textarea className={campo} style={estiloCampo} rows={4} value={mensaje} onChange={(e) => setMensaje(e.target.value)} required maxLength={5000} />
      </label>
      <label aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }}>
        Web
        <input tabIndex={-1} autoComplete="off" value={web} onChange={(e) => setWeb(e.target.value)} />
      </label>
      {aviso && (
        <p className="text-sm" role="alert" style={{ color: "var(--wp-red)" }}>
          {aviso}
        </p>
      )}
      <button type="submit" className="wp-btn self-start" disabled={estado === "enviando"}>
        {estado === "enviando" ? "Enviando…" : "Enviar mensaje"}
      </button>
    </form>
  );
}
