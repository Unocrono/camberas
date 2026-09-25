import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** Piezas de formulario del editor de la web propia (sin react-hook-form: el
 *  contenido es un JSON anidado y se edita como objeto). */

export function Campo({ etiqueta, ayuda, children }: { etiqueta: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{etiqueta}</Label>
      {children}
      {ayuda && <p className="text-xs text-muted-foreground">{ayuda}</p>}
    </div>
  );
}

export function Texto({ etiqueta, valor, onChange, ayuda, placeholder, type = "text" }: { etiqueta: string; valor: string | undefined; onChange: (v: string) => void; ayuda?: string; placeholder?: string; type?: string }) {
  return (
    <Campo etiqueta={etiqueta} ayuda={ayuda}>
      <Input type={type} value={valor ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </Campo>
  );
}

export function TextoLargo({ etiqueta, valor, onChange, ayuda, filas = 4 }: { etiqueta: string; valor: string | undefined; onChange: (v: string) => void; ayuda?: string; filas?: number }) {
  return (
    <Campo etiqueta={etiqueta} ayuda={ayuda}>
      <Textarea value={valor ?? ""} rows={filas} onChange={(e) => onChange(e.target.value)} />
    </Campo>
  );
}

/** Lista de textos, una por línea */
export function Lineas({ etiqueta, valor, onChange, ayuda }: { etiqueta: string; valor: string[] | undefined; onChange: (v: string[]) => void; ayuda?: string }) {
  return (
    <Campo etiqueta={etiqueta} ayuda={ayuda ?? "Una por línea"}>
      <Textarea
        value={(valor ?? []).join("\n")}
        rows={Math.max(3, (valor?.length ?? 0) + 1)}
        onChange={(e) => onChange(e.target.value.split("\n").map((l) => l.trim()).filter(Boolean))}
      />
    </Campo>
  );
}

export interface Columna<T> {
  clave: keyof T & string;
  etiqueta: string;
  ancho?: string;
  placeholder?: string;
}

/** Tabla editable de objetos con añadir, borrar y reordenar */
export function ListaEditable<T extends Record<string, unknown>>({
  etiqueta,
  valor,
  onChange,
  columnas,
  nuevo,
  ayuda,
}: {
  etiqueta: string;
  valor: T[] | undefined;
  onChange: (v: T[]) => void;
  columnas: Columna<T>[];
  nuevo: () => T;
  ayuda?: string;
}) {
  const filas = valor ?? [];
  const set = (i: number, clave: keyof T, v: string) => onChange(filas.map((f, j) => (j === i ? { ...f, [clave]: v } : f)));
  const mover = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= filas.length) return;
    const copia = [...filas];
    [copia[i], copia[j]] = [copia[j], copia[i]];
    onChange(copia);
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm">{etiqueta}</Label>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...filas, nuevo()])}>
          <Plus className="mr-1 h-4 w-4" /> Añadir
        </Button>
      </div>
      {ayuda && <p className="text-xs text-muted-foreground">{ayuda}</p>}
      {filas.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                {columnas.map((c) => (
                  <th key={c.clave} className="px-2 py-1.5 font-medium" style={{ width: c.ancho }}>{c.etiqueta}</th>
                ))}
                <th className="w-[110px]" />
              </tr>
            </thead>
            <tbody>
              {filas.map((fila, i) => (
                <tr key={i} className="border-t">
                  {columnas.map((c) => (
                    <td key={c.clave} className="p-1">
                      <Input className="h-8" value={String(fila[c.clave] ?? "")} placeholder={c.placeholder} onChange={(e) => set(i, c.clave, e.target.value)} />
                    </td>
                  ))}
                  <td className="p-1">
                    <div className="flex gap-0.5">
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => mover(i, -1)} aria-label="Subir"><ArrowUp className="h-3.5 w-3.5" /></Button>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => mover(i, 1)} aria-label="Bajar"><ArrowDown className="h-3.5 w-3.5" /></Button>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onChange(filas.filter((_, j) => j !== i))} aria-label="Quitar"><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Pares [texto, texto] (horarios de dorsales, medios sanitarios) como tabla */
export function Pares({ etiqueta, valor, onChange, cabeceras, ayuda }: { etiqueta: string; valor: string[][] | undefined; onChange: (v: string[][]) => void; cabeceras: [string, string]; ayuda?: string }) {
  const filas = (valor ?? []).map(([a, b]) => ({ a: a ?? "", b: b ?? "" }));
  return (
    <ListaEditable
      etiqueta={etiqueta}
      ayuda={ayuda}
      valor={filas}
      onChange={(v) => onChange(v.map((f) => [String(f.a ?? ""), String(f.b ?? "")]))}
      columnas={[
        { clave: "a", etiqueta: cabeceras[0] },
        { clave: "b", etiqueta: cabeceras[1] },
      ]}
      nuevo={() => ({ a: "", b: "" })}
    />
  );
}
