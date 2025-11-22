import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, Power, PowerOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EdgeFunctionFlag {
  id: string;
  function_name: string;
  is_enabled: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export function EdgeFunctionsManagement() {
  const [functions, setFunctions] = useState<EdgeFunctionFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchFunctions();
  }, []);

  const fetchFunctions = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("edge_function_flags")
        .select("*")
        .order("function_name");

      if (error) throw error;

      setFunctions(data || []);
    } catch (error: any) {
      console.error("Error fetching edge functions:", error);
      toast({
        title: "Error al cargar funciones",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleFunction = async (functionId: string, currentState: boolean) => {
    try {
      setUpdating(functionId);
      const { error } = await supabase
        .from("edge_function_flags")
        .update({ is_enabled: !currentState })
        .eq("id", functionId);

      if (error) throw error;

      setFunctions(
        functions.map((fn) =>
          fn.id === functionId ? { ...fn, is_enabled: !currentState } : fn
        )
      );

      toast({
        title: currentState ? "Función desactivada" : "Función activada",
        description: `La función ha sido ${currentState ? "desactivada" : "activada"} correctamente.`,
      });
    } catch (error: any) {
      console.error("Error toggling function:", error);
      toast({
        title: "Error al actualizar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUpdating(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const enabledCount = functions.filter((fn) => fn.is_enabled).length;
  const totalCount = functions.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Funciones Edge</h2>
          <p className="text-muted-foreground mt-1">
            Gestiona la activación y desactivación de funciones edge del sistema
          </p>
        </div>
        <Button onClick={fetchFunctions} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Actualizar
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Total de Funciones</CardDescription>
            <CardTitle className="text-4xl">{totalCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Funciones Activas</CardDescription>
            <CardTitle className="text-4xl text-green-600 dark:text-green-400">
              {enabledCount}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Funciones Inactivas</CardDescription>
            <CardTitle className="text-4xl text-red-600 dark:text-red-400">
              {totalCount - enabledCount}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4">
        {functions.map((fn) => (
          <Card key={fn.id} className={!fn.is_enabled ? "opacity-60" : ""}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-xl font-mono">
                      {fn.function_name}
                    </CardTitle>
                    {fn.is_enabled ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 dark:bg-green-900/30 px-2 py-1 text-xs font-medium text-green-700 dark:text-green-300">
                        <Power className="h-3 w-3" />
                        Activa
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-900/30 px-2 py-1 text-xs font-medium text-red-700 dark:text-red-300">
                        <PowerOff className="h-3 w-3" />
                        Inactiva
                      </span>
                    )}
                  </div>
                  {fn.description && (
                    <CardDescription className="mt-2">
                      {fn.description}
                    </CardDescription>
                  )}
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id={`switch-${fn.id}`}
                    checked={fn.is_enabled}
                    onCheckedChange={() => toggleFunction(fn.id, fn.is_enabled)}
                    disabled={updating === fn.id}
                  />
                  <Label
                    htmlFor={`switch-${fn.id}`}
                    className="cursor-pointer select-none"
                  >
                    {updating === fn.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <span className="sr-only">
                        {fn.is_enabled ? "Desactivar" : "Activar"}
                      </span>
                    )}
                  </Label>
                </div>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
