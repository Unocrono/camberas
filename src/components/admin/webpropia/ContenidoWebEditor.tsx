import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ContenidoSchema, limpiarVacios, type Contenido } from "@/eventos/contenidoSchema";
import { useEventoPublico } from "@/eventos/useEventoPublico";
import { Lineas, ListaEditable, Pares, Texto, TextoLargo } from "./campos";

interface Props {
  /** Slug de la carrera: para listar sus recorridos (evento_publico) */
  slug: string | null;
  contenido: Record<string, unknown>;
  guardando: boolean;
  onGuardar: (contenido: Record<string, unknown>) => Promise<boolean>;
}

/**
 * Editor por secciones de race_web.contenido: lo que la web enseña y Camberas
 * no tiene en tablas. Fechas, precios, recorridos y campos del formulario NO
 * se editan aquí: salen de la carrera. Se valida con ContenidoSchema al
 * guardar; los vacíos no se guardan.
 */
export function ContenidoWebEditor({ slug, contenido, guardando, onGuardar }: Props) {
  const [c, setC] = useState<Contenido>(() => (ContenidoSchema.safeParse(contenido).success ? (contenido as Contenido) : {}));
  const { data: evento } = useEventoPublico(slug ?? undefined);
  const [cambios, setCambios] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setC(ContenidoSchema.safeParse(contenido).success ? (contenido as Contenido) : {});
    setCambios(false);
  }, [contenido]);

  // set anidado: patch("dorsales", { lugar })
  const patch = <K extends keyof Contenido>(k: K, v: Partial<NonNullable<Contenido[K]>> | Contenido[K]) => {
    setC((prev) => {
      const actual = prev[k];
      const nuevo = actual && typeof actual === "object" && !Array.isArray(actual) && v && typeof v === "object" && !Array.isArray(v) ? { ...(actual as object), ...(v as object) } : v;
      return { ...prev, [k]: nuevo } as Contenido;
    });
    setCambios(true);
  };
  const setTexto = <K extends keyof Contenido>(k: K) => (v: string) => patch(k, v as Contenido[K]);
  // Lo que la web añade a un recorrido concreto (por id de race_distances)
  type PruebaWeb = NonNullable<Contenido["pruebas"]>[number];
  const pruebaWeb = (id: string): Partial<PruebaWeb> => c.pruebas?.find((p) => p.id === id) ?? {};
  const patchPrueba = (id: string, parcial: Partial<PruebaWeb>) => {
    setC((prev) => {
      const lista = [...(prev.pruebas ?? [])];
      const i = lista.findIndex((p) => p.id === id);
      const nuevo = { ...(i >= 0 ? lista[i] : { id }), ...parcial } as PruebaWeb;
      if (i >= 0) lista[i] = nuevo;
      else lista.push(nuevo);
      return { ...prev, pruebas: lista };
    });
    setCambios(true);
  };

  const guardar = async () => {
    const limpio = limpiarVacios(c);
    const r = ContenidoSchema.safeParse(limpio);
    if (!r.success) {
      setError(r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" · "));
      return;
    }
    setError(null);
    if (await onGuardar(r.data as Record<string, unknown>)) setCambios(false);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Contenido de la web</CardTitle>
          <CardDescription>
            Solo lo que Camberas no tiene en tablas. Nombre, subtítulo, descripción, fechas, precios, recorridos, salidas, formulario, reglamento por secciones, FAQ, categorías, avituallamientos y rutómetro salen de la propia carrera y se editan en sus pantallas.
          </CardDescription>
        </div>
        <Button type="button" onClick={guardar} disabled={guardando || !cambios}>
          {guardando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Guardar contenido
        </Button>
      </CardHeader>
      <CardContent>
        {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
        <Accordion type="multiple" defaultValue={["presentacion"]} className="w-full">
          <AccordionItem value="presentacion">
            <AccordionTrigger>Presentación y organizador</AccordionTrigger>
            <AccordionContent className="space-y-4 pt-2">
              <div className="grid gap-4 md:grid-cols-2">
                <Texto etiqueta="Nombre corto" valor={c.nombreCorto} onChange={setTexto("nombreCorto")} ayuda="Para la cabecera. Si se deja vacío, el nombre completo." />
                <Texto etiqueta="Fecha en texto" valor={c.fechaTexto} onChange={setTexto("fechaTexto")} placeholder="Domingo 1 de noviembre de 2026" />
                <Texto etiqueta="Federación / calendario" valor={c.federacion} onChange={setTexto("federacion")} placeholder="Calendario oficial FCDME 2027" />
              </div>
              <p className="text-xs text-muted-foreground">El subtítulo y la descripción son los de la carrera (Carreras, editar).</p>
              <div className="grid gap-4 md:grid-cols-3">
                <Texto etiqueta="Zona / sierra" valor={c.lugar?.zona} onChange={(v) => patch("lugar", { zona: v })} />
                <Texto etiqueta="Municipio" valor={c.lugar?.municipio} onChange={(v) => patch("lugar", { municipio: v })} />
                <Texto etiqueta="Provincia" valor={c.lugar?.provincia} onChange={(v) => patch("lugar", { provincia: v })} />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Texto etiqueta="Organizador (nombre público)" valor={c.organizador?.nombre} onChange={(v) => patch("organizador", { nombre: v })} />
                <Texto etiqueta="Razón social (aviso legal)" valor={c.organizador?.razonSocial} onChange={(v) => patch("organizador", { razonSocial: v })} />
                <Texto etiqueta="CIF" valor={c.organizador?.cif} onChange={(v) => patch("organizador", { cif: v })} />
                <Texto etiqueta="Dirección (aviso legal)" valor={c.organizador?.direccion} onChange={(v) => patch("organizador", { direccion: v })} />
                <Texto etiqueta="Teléfono" valor={c.organizador?.telefono} onChange={(v) => patch("organizador", { telefono: v })} />
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="recorridos">
            <AccordionTrigger>Recorridos: descripción y relato</AccordionTrigger>
            <AccordionContent className="space-y-6 pt-2">
              <p className="text-xs text-muted-foreground">Distancia, desniveles, salida, precio, avituallamientos y rutómetro salen de Camberas. Aquí solo lo que no tiene tabla: el texto de cada recorrido.</p>
              {!evento && <p className="text-sm text-muted-foreground">Cargando los recorridos de la carrera…</p>}
              {evento?.pruebas.map((pr) => {
                const w = pruebaWeb(pr.id);
                return (
                  <div key={pr.id} className="space-y-3 rounded-md border p-3">
                    <p className="font-semibold">{pr.nombre}</p>
                    <Texto etiqueta="Descripción corta" valor={w.descripcion} onChange={(v) => patchPrueba(pr.id, { descripcion: v })} ayuda="Una o dos frases; sale en la tarjeta de la portada y en la página del recorrido." />
                    <TextoLargo etiqueta="Relato del recorrido" valor={w.relato} onChange={(v) => patchPrueba(pr.id, { relato: v })} filas={5} ayuda="Texto largo, solo en la página del recorrido. Párrafos separados por línea en blanco." />
                    <div className="grid gap-4 md:grid-cols-2">
                      <Texto etiqueta="Marcaje" valor={w.marcaje} onChange={(v) => patchPrueba(pr.id, { marcaje: v })} placeholder="Cintas y banderines naranjas" />
                      <Texto etiqueta="Color del recorrido (hex)" valor={w.color} onChange={(v) => patchPrueba(pr.id, { color: v })} placeholder="#C62828" />
                    </div>
                    <Pares etiqueta="Terreno" valor={w.terreno} onChange={(v) => patchPrueba(pr.id, { terreno: v })} cabeceras={["Tipo de firme", "Distancia"]} />
                  </div>
                );
              })}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="beneficiario">
            <AccordionTrigger>Causa solidaria (si la hay)</AccordionTrigger>
            <AccordionContent className="space-y-4 pt-2">
              <div className="grid gap-4 md:grid-cols-2">
                <Texto etiqueta="Entidad beneficiaria" valor={c.beneficiario?.nombre} onChange={(v) => patch("beneficiario", { ...(c.beneficiario ?? { nombre: "" }), nombre: v })} />
                <Texto etiqueta="Web" valor={c.beneficiario?.web} onChange={(v) => patch("beneficiario", { ...(c.beneficiario ?? { nombre: "" }), web: v })} />
              </div>
              <TextoLargo etiqueta="Texto" valor={c.beneficiario?.texto} onChange={(v) => patch("beneficiario", { ...(c.beneficiario ?? { nombre: "" }), texto: v })} />
              <Texto etiqueta="Logo (URL)" valor={c.beneficiario?.logo} onChange={(v) => patch("beneficiario", { ...(c.beneficiario ?? { nombre: "" }), logo: v })} />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="inscripcion">
            <AccordionTrigger>Inscripción: qué incluye, notas, devoluciones</AccordionTrigger>
            <AccordionContent className="space-y-4 pt-2">
              <Lineas etiqueta="Qué incluye la inscripción" valor={c.inscripcion?.incluye} onChange={(v) => patch("inscripcion", { incluye: v })} />
              <div className="grid gap-4 md:grid-cols-2">
                <Texto etiqueta="Cierre (texto)" valor={c.inscripcion?.cierreTexto} onChange={(v) => patch("inscripcion", { cierreTexto: v })} placeholder="15 de febrero o al agotar dorsales" />
                <Texto etiqueta="Edad mínima" type="number" valor={c.inscripcion?.edadMinima?.toString()} onChange={(v) => patch("inscripcion", { edadMinima: v ? Number(v) : undefined })} />
              </div>
              <TextoLargo etiqueta="Nota" valor={c.inscripcion?.nota} onChange={(v) => patch("inscripcion", { nota: v })} filas={2} />
              <TextoLargo etiqueta="Bajas y devoluciones (texto)" valor={c.inscripcion?.devolucion?.texto} onChange={(v) => patch("inscripcion", { devolucion: { ...(c.inscripcion?.devolucion ?? {}), texto: v } })} filas={2} ayuda="Si la carrera tiene política de devolución por tramos en Camberas, se muestra esa; este texto la complementa." />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="reglamento">
            <AccordionTrigger>Reglamento en tarjetas: material, marcaje, normas</AccordionTrigger>
            <AccordionContent className="space-y-4 pt-2">
              <p className="text-xs text-muted-foreground">Si el reglamento de la carrera (Reglamento, en el menú) tiene secciones «Material obligatorio», «Descalificaciones» o «Reclamaciones», sus líneas con viñeta mandan aquí; estos campos solo rellenan lo que falte.</p>
              <Texto etiqueta="Reglamento en PDF (URL)" valor={c.reglamento?.url} onChange={(v) => patch("reglamento", { url: v })} ayuda="Si el reglamento está publicado por secciones en Camberas, la web usa ese." />
              <Lineas etiqueta="Material obligatorio" valor={c.reglamento?.materialObligatorio} onChange={(v) => patch("reglamento", { materialObligatorio: v })} />
              <TextoLargo etiqueta="Normas sobre el material" valor={c.reglamento?.normasMaterial} onChange={(v) => patch("reglamento", { normasMaterial: v })} filas={2} />
              <Lineas etiqueta="Marcaje y seguridad en ruta" valor={c.reglamento?.marcaje} onChange={(v) => patch("reglamento", { marcaje: v })} />
              <Lineas etiqueta="Otras normas" valor={c.reglamento?.normas} onChange={(v) => patch("reglamento", { normas: v })} />
              <TextoLargo etiqueta="Reclamaciones" valor={c.reglamento?.reclamaciones} onChange={(v) => patch("reglamento", { reclamaciones: v })} filas={2} />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="dia">
            <AccordionTrigger>Día de carrera: programa, dorsales, premios, sanitario</AccordionTrigger>
            <AccordionContent className="space-y-4 pt-2">
              <ListaEditable
                etiqueta="Programa"
                ayuda="Si se deja vacío, la web muestra las horas de salida de los recorridos."
                valor={c.programa as Record<string, unknown>[] | undefined}
                onChange={(v) => patch("programa", v as Contenido["programa"])}
                columnas={[
                  { clave: "fecha", etiqueta: "Fecha", ancho: "120px", placeholder: "2026-11-01" },
                  { clave: "hora", etiqueta: "Hora", ancho: "80px", placeholder: "09:30" },
                  { clave: "horaFin", etiqueta: "Fin", ancho: "80px" },
                  { clave: "titulo", etiqueta: "Qué" },
                  { clave: "lugar", etiqueta: "Dónde" },
                ]}
                nuevo={() => ({ fecha: "", hora: "", horaFin: "", titulo: "", lugar: "" })}
              />
              <Texto etiqueta="Entrega de premios (hora)" valor={c.entregaPremios} onChange={setTexto("entregaPremios")} placeholder="16:00" />
              <Texto etiqueta="Recogida de dorsales: lugar" valor={c.dorsales?.lugar} onChange={(v) => patch("dorsales", { lugar: v })} />
              <Pares etiqueta="Recogida de dorsales: horarios" valor={c.dorsales?.horarios} onChange={(v) => patch("dorsales", { horarios: v })} cabeceras={["Día", "Horas"]} />
              <TextoLargo etiqueta="Recogida de dorsales: nota" valor={c.dorsales?.nota} onChange={(v) => patch("dorsales", { nota: v })} filas={2} />
              <ListaEditable
                etiqueta="Premios"
                valor={c.premios as Record<string, unknown>[] | undefined}
                onChange={(v) => patch("premios", v as Contenido["premios"])}
                columnas={[
                  { clave: "premio", etiqueta: "Premio" },
                  { clave: "categoria", etiqueta: "Categoría / quién" },
                  { clave: "texto", etiqueta: "Detalle" },
                ]}
                nuevo={() => ({ premio: "", categoria: "", texto: "" })}
              />
              <Pares etiqueta="Servicio sanitario: medios" valor={c.sanitario?.medios} onChange={(v) => patch("sanitario", { medios: v })} cabeceras={["Cuántos", "Qué"]} ayuda="Si el voluntariado tiene puestos de tipo «Sanitario», la web enseña esos (cuántos y nombre) y esta lista no hace falta." />
              <TextoLargo etiqueta="Servicio sanitario: nota" valor={c.sanitario?.nota} onChange={(v) => patch("sanitario", { nota: v })} filas={2} />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="servicios">
            <AccordionTrigger>Servicios al corredor y camiseta</AccordionTrigger>
            <AccordionContent className="space-y-4 pt-2">
              <p className="text-xs text-muted-foreground">Si el formulario de inscripción tiene el campo de talla de camiseta, la web ya la da por incluida con esas tallas; aquí solo el texto, la fecha límite o el precio si es opcional.</p>
              <ListaEditable
                etiqueta="Servicios"
                valor={c.servicios as Record<string, unknown>[] | undefined}
                onChange={(v) => patch("servicios", v as Contenido["servicios"])}
                columnas={[
                  { clave: "nombre", etiqueta: "Servicio" },
                  { clave: "texto", etiqueta: "Detalle" },
                ]}
                nuevo={() => ({ nombre: "", texto: "" })}
              />
              <div className="flex items-center gap-3 rounded-md border p-3">
                <Switch checked={c.camiseta?.incluida ?? false} onCheckedChange={(v) => patch("camiseta", { incluida: v })} />
                <Label>Camiseta incluida en la inscripción</Label>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <Texto etiqueta="Precio si es opcional (€)" type="number" valor={c.camiseta?.precio?.toString()} onChange={(v) => patch("camiseta", { precio: v ? Number(v) : undefined })} />
                <Texto etiqueta="Garantizada hasta (fecha)" valor={c.camiseta?.hasta} onChange={(v) => patch("camiseta", { hasta: v })} placeholder="2027-01-15" />
                <Texto etiqueta="Límite de unidades" type="number" valor={c.camiseta?.limite?.toString()} onChange={(v) => patch("camiseta", { limite: v ? Number(v) : undefined })} />
              </div>
              <TextoLargo etiqueta="Texto de la camiseta" valor={c.camiseta?.texto} onChange={(v) => patch("camiseta", { texto: v })} filas={2} />
              <Texto etiqueta="Imagen de la camiseta (URL)" valor={c.camiseta?.imagen} onChange={(v) => patch("camiseta", { imagen: v })} />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="info">
            <AccordionTrigger>Info práctica</AccordionTrigger>
            <AccordionContent className="space-y-4 pt-2">
              <TextoLargo etiqueta="Cómo llegar" valor={c.infoPractica?.comoLlegar} onChange={(v) => patch("infoPractica", { comoLlegar: v })} filas={3} />
              <TextoLargo etiqueta="Aparcamiento" valor={c.infoPractica?.parking} onChange={(v) => patch("infoPractica", { parking: v })} filas={2} />
              <TextoLargo etiqueta="Alojamiento" valor={c.infoPractica?.alojamiento} onChange={(v) => patch("infoPractica", { alojamiento: v })} filas={3} />
              <TextoLargo etiqueta="Espectadores" valor={c.infoPractica?.espectadores} onChange={(v) => patch("infoPractica", { espectadores: v })} filas={3} />
              <p className="text-xs text-muted-foreground">Las preguntas frecuentes son las de la carrera (Preguntas frecuentes, en el menú).</p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="medioambiente">
            <AccordionTrigger>Medioambiente</AccordionTrigger>
            <AccordionContent className="space-y-4 pt-2">
              <Texto etiqueta="Espacio protegido" valor={c.medioAmbiente?.espacio} onChange={(v) => patch("medioAmbiente", { espacio: v })} placeholder="LIC Sierra del Escudo de Cabuérniga" />
              <Texto etiqueta="Hábitats" valor={c.medioAmbiente?.habitats} onChange={(v) => patch("medioAmbiente", { habitats: v })} />
              <Texto etiqueta="Especies" valor={c.medioAmbiente?.especies} onChange={(v) => patch("medioAmbiente", { especies: v })} />
              <TextoLargo etiqueta="Normas" valor={c.medioAmbiente?.normas} onChange={(v) => patch("medioAmbiente", { normas: v })} filas={2} />
              <Texto etiqueta="Adhesión" valor={c.medioAmbiente?.adhesion} onChange={(v) => patch("medioAmbiente", { adhesion: v })} />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="enlaces">
            <AccordionTrigger>Contacto, documentos, fotos y SEO</AccordionTrigger>
            <AccordionContent className="space-y-4 pt-2">
              <p className="text-xs text-muted-foreground">El email de contacto y la web del organizador son los de la carrera (Carreras, editar).</p>
              <div className="grid gap-4 md:grid-cols-2">
                <Texto etiqueta="Email de protección de datos" valor={c.contacto?.emailDatos} onChange={(v) => patch("contacto", { emailDatos: v })} />
                <Texto etiqueta="Teléfono" valor={c.contacto?.telefono} onChange={(v) => patch("contacto", { telefono: v })} />
                <Texto etiqueta="Dirección" valor={c.contacto?.direccion} onChange={(v) => patch("contacto", { direccion: v })} />
                <Texto etiqueta="Instagram (URL)" valor={c.contacto?.redes?.instagram} onChange={(v) => patch("contacto", { redes: { ...(c.contacto?.redes ?? {}), instagram: v } })} />
                <Texto etiqueta="Facebook (URL)" valor={c.contacto?.redes?.facebook} onChange={(v) => patch("contacto", { redes: { ...(c.contacto?.redes ?? {}), facebook: v } })} />
              </div>
              <ListaEditable
                etiqueta="Documentos"
                valor={c.documentos as Record<string, unknown>[] | undefined}
                onChange={(v) => patch("documentos", v as Contenido["documentos"])}
                columnas={[
                  { clave: "nombre", etiqueta: "Nombre" },
                  { clave: "url", etiqueta: "URL" },
                  { clave: "tipo", etiqueta: "Tipo", ancho: "120px", placeholder: "reglamento" },
                ]}
                nuevo={() => ({ nombre: "", url: "", tipo: "" })}
              />
              <div className="grid gap-4 md:grid-cols-2">
                <Texto etiqueta="Galería de fotos (URL)" valor={c.fotos?.url} onChange={(v) => patch("fotos", { url: v, disponible: !!v })} />
                <Texto etiqueta="Imagen del bosque / medioambiente (URL)" valor={c.imagenes?.bosque} onChange={(v) => patch("imagenes", { ...(c.imagenes ?? {}), bosque: v })} />
                <Texto etiqueta="Título para Google" valor={c.seo?.titulo} onChange={(v) => patch("seo", { titulo: v })} />
                <Texto etiqueta="Descripción para Google" valor={c.seo?.descripcion} onChange={(v) => patch("seo", { descripcion: v })} />
                <Texto etiqueta="Google Analytics del organizador (G-XXXX)" valor={c.analytics?.ga4} onChange={(v) => patch("analytics", { ga4: v })} ayuda="Solo se carga en la web propia y tras aceptar el aviso de cookies." />
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}
