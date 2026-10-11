import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layers, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { EventoPublico } from "@/eventos/tipos";

interface FeedInstagram {
  disponible: boolean;
  usuario?: string;
  perfil?: string;
  publicaciones?: {
    id: string;
    tipo: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
    imagen: string;
    enlace: string;
    texto: string;
  }[];
}

/**
 * Las últimas publicaciones del Instagram de la carrera (el de Contacto ›
 * redes). Las sirve la función instagram-feed, que las lee desde la cuenta de
 * Camberas y guarda una hora. Si la cuenta no es profesional, no hay
 * publicaciones o Meta falla, la sección no sale: nunca un hueco vacío.
 */
export function Instagram({ evento }: { evento: EventoPublico }) {
  const tiene = !!evento.contacto?.redes?.instagram && !!evento.slug;
  const { data } = useQuery({
    queryKey: ["instagram-feed", evento.slug],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("instagram-feed", { body: { slug: evento.slug } });
      if (error) throw error;
      return data as FeedInstagram;
    },
    enabled: tiene,
    staleTime: 10 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  // Una imagen caducada o bloqueada se quita, no se deja rota
  const [rotas, setRotas] = useState<Set<string>>(new Set());

  const publicaciones = (data?.publicaciones ?? []).filter((p) => !rotas.has(p.id));
  if (!tiene || !data?.disponible || publicaciones.length === 0) return null;

  return (
    <section id="instagram" className="px-5 py-12 lg:px-[72px] lg:py-24">
      <div className="mx-auto max-w-[1296px]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="wp-label">Instagram</p>
            <h2 className="mt-3" style={{ fontSize: "clamp(32px, 4vw, 48px)" }}>@{data.usuario}</h2>
          </div>
          <a
            href={data.perfil}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[15px] font-semibold"
            style={{ color: "var(--wp-marca)" }}
          >
            Síguenos en Instagram →
          </a>
        </div>
        <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 list-none p-0 m-0">
          {publicaciones.map((p) => (
            <li key={p.id}>
              <a
                href={p.enlace}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative block aspect-square overflow-hidden rounded-[var(--wp-radio,16px)]"
                style={{ background: "var(--wp-border)" }}
                title={p.texto || undefined}
              >
                <img
                  src={p.imagen}
                  alt={p.texto ? p.texto.slice(0, 120) : `Publicación de @${data.usuario}`}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  onError={() => setRotas((r) => new Set(r).add(p.id))}
                />
                {p.tipo !== "IMAGE" && (
                  <span className="absolute right-2 top-2 rounded-full bg-black/55 p-1.5 text-white" aria-hidden="true">
                    {p.tipo === "VIDEO" ? <Play className="h-3.5 w-3.5" /> : <Layers className="h-3.5 w-3.5" />}
                  </span>
                )}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
