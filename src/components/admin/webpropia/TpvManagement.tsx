import { useCallback, useEffect, useState } from "react";
import { CreditCard, Loader2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { rpcSinTipos, tablaSinTipos } from "@/eventos/rpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface Tpv {
  merchant_code: string;
  terminal: string;
  entorno: "test" | "prod";
  activo: boolean;
  titular: string | null;
  updated_at: string;
}

/**
 * TPV Redsys propio del organizador: los cobros de las inscripciones van a su
 * cuenta. La clave SHA-256 se manda a tpv_guardar(), que la mete en el Vault;
 * nunca se lee de vuelta ni se muestra. Sin TPV activo se cobra con el de UNO.
 */
export function TpvManagement({ raceId }: { raceId: string }) {
  const { toast } = useToast();
  const [tpv, setTpv] = useState<Tpv | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [merchant, setMerchant] = useState("");
  const [terminal, setTerminal] = useState("1");
  const [clave, setClave] = useState("");
  const [entorno, setEntorno] = useState<"test" | "prod">("test");
  const [activo, setActivo] = useState(false);
  const [titular, setTitular] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data } = await tablaSinTipos("race_tpv").select("merchant_code, terminal, entorno, activo, titular, updated_at").eq("race_id", raceId).maybeSingle();
    const t = (data as Tpv | null) ?? null;
    setTpv(t);
    setMerchant(t?.merchant_code ?? "");
    setTerminal(t?.terminal ?? "1");
    setEntorno(t?.entorno ?? "test");
    setActivo(t?.activo ?? false);
    setTitular(t?.titular ?? "");
    setClave("");
    setCargando(false);
  }, [raceId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const guardar = async () => {
    if (!/^[0-9]{6,15}$/.test(merchant.trim())) return toast({ title: "Código de comercio no válido", description: "El FUC son entre 6 y 15 dígitos.", variant: "destructive" });
    if (!tpv && !clave.trim()) return toast({ title: "Falta la clave", description: "Copia la clave SHA-256 del comercio (la da tu banco).", variant: "destructive" });
    setGuardando(true);
    try {
      await rpcSinTipos("tpv_guardar", {
        p_race_id: raceId,
        p_merchant_code: merchant.trim(),
        p_terminal: terminal.trim() || "1",
        p_clave: clave.trim() || null,
        p_entorno: entorno,
        p_activo: activo,
        p_titular: titular.trim() || null,
      });
      toast({ title: "TPV guardado", description: activo ? "Las inscripciones se cobrarán en este comercio." : "Guardado, pero desactivado: se sigue cobrando con el TPV de UNO." });
      cargar();
    } catch (e) {
      toast({ title: "No se pudo guardar el TPV", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" /> TPV del organizador</CardTitle>
        <CardDescription>
          Con tu propio comercio Redsys, el dinero de las inscripciones entra directamente en tu cuenta bancaria. Los datos te los da tu banco al darte de alta el TPV virtual: código de comercio (FUC), terminal y clave SHA-256. Sin TPV activo, se cobra con el de UNO y se te liquida.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {cargando ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>
        ) : (
          <>
            {tpv && (
              <Alert>
                <AlertTitle>{tpv.activo ? "TPV propio activo" : "TPV propio guardado pero desactivado"}</AlertTitle>
                <AlertDescription>
                  Comercio {tpv.merchant_code} · terminal {tpv.terminal} · entorno {tpv.entorno === "prod" ? "real" : "pruebas"} · clave guardada en el Vault (no se muestra).
                </AlertDescription>
              </Alert>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Código de comercio (FUC)</Label>
                <Input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="999008881" inputMode="numeric" />
              </div>
              <div className="space-y-1.5">
                <Label>Terminal</Label>
                <Input value={terminal} onChange={(e) => setTerminal(e.target.value)} placeholder="1" inputMode="numeric" />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Clave SHA-256 {tpv ? "(dejar vacío para conservar la actual)" : ""}</Label>
                <Input type="password" value={clave} onChange={(e) => setClave(e.target.value)} placeholder={tpv ? "••••••••" : "Clave que te da el banco"} autoComplete="off" />
              </div>
              <div className="space-y-1.5">
                <Label>Entorno</Label>
                <Select value={entorno} onValueChange={(v) => setEntorno(v as "test" | "prod")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="test">Pruebas (sis-t.redsys.es, sin cargos reales)</SelectItem>
                    <SelectItem value="prod">Real (sis.redsys.es)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Titular (informativo)</Label>
                <Input value={titular} onChange={(e) => setTitular(e.target.value)} placeholder="Club Deportivo…" />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label>Cobrar con este TPV</Label>
                <p className="text-xs text-muted-foreground">Desactivado, se sigue cobrando con el TPV de UNO.</p>
              </div>
              <Switch checked={activo} onCheckedChange={setActivo} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={guardar} disabled={guardando}>
                {guardando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Guardar TPV
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Para probarlo: guárdalo en entorno de pruebas y activo, haz una inscripción de pago en la web de la carrera con una tarjeta de pruebas de Redsys, y comprueba en el panel que queda pagada. Después cambia a real. Las devoluciones se hacen desde el panel de tu banco.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
