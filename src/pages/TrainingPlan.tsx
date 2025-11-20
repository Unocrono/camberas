import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Sparkles } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ReactMarkdown from "react-markdown";

const TrainingPlan = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<string>("");
  const [formData, setFormData] = useState({
    goal: "",
    fitnessLevel: "",
    weeksUntilRace: "",
    raceDistance: "",
  });

  const handleGenerate = async () => {
    if (!user) {
      toast({
        title: "Autenticación requerida",
        description: "Debes iniciar sesión para generar un plan de entrenamiento",
        variant: "destructive",
      });
      navigate("/auth");
      return;
    }

    if (!formData.goal || !formData.fitnessLevel || !formData.weeksUntilRace || !formData.raceDistance) {
      toast({
        title: "Campos incompletos",
        description: "Por favor completa todos los campos",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-training-plan", {
        body: formData,
      });

      if (error) throw error;

      setPlan(data.plan);

      // Save to database
      await supabase.from("training_plans").insert({
        user_id: user.id,
        goal: formData.goal,
        fitness_level: formData.fitnessLevel,
        weeks_until_race: parseInt(formData.weeksUntilRace),
        plan_content: data.plan,
      });

      toast({
        title: "Plan generado",
        description: "Tu plan de entrenamiento ha sido creado exitosamente",
      });
    } catch (error) {
      console.error("Error generating plan:", error);
      toast({
        title: "Error",
        description: "No se pudo generar el plan de entrenamiento",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-bold flex items-center justify-center gap-2">
              <Sparkles className="w-8 h-8 text-primary" />
              Plan de Entrenamiento Personalizado
            </h1>
            <p className="text-muted-foreground">
              Genera un plan de entrenamiento adaptado a tus objetivos con IA
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Información del Entrenamiento</CardTitle>
              <CardDescription>
                Completa los datos para generar tu plan personalizado
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="goal">Objetivo de la Carrera</Label>
                <Textarea
                  id="goal"
                  placeholder="Ej: Completar mi primera ultra trail de 50km, mejorar mi tiempo en carreras de montaña..."
                  value={formData.goal}
                  onChange={(e) => setFormData({ ...formData, goal: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fitnessLevel">Nivel de Condición</Label>
                  <Select
                    value={formData.fitnessLevel}
                    onValueChange={(value) => setFormData({ ...formData, fitnessLevel: value })}
                  >
                    <SelectTrigger id="fitnessLevel">
                      <SelectValue placeholder="Selecciona" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="principiante">Principiante</SelectItem>
                      <SelectItem value="intermedio">Intermedio</SelectItem>
                      <SelectItem value="avanzado">Avanzado</SelectItem>
                      <SelectItem value="elite">Elite</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="weeks">Semanas hasta la Carrera</Label>
                  <Input
                    id="weeks"
                    type="number"
                    min="1"
                    max="52"
                    placeholder="12"
                    value={formData.weeksUntilRace}
                    onChange={(e) => setFormData({ ...formData, weeksUntilRace: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="distance">Distancia (km)</Label>
                  <Input
                    id="distance"
                    type="number"
                    min="1"
                    placeholder="50"
                    value={formData.raceDistance}
                    onChange={(e) => setFormData({ ...formData, raceDistance: e.target.value })}
                  />
                </div>
              </div>

              <Button
                onClick={handleGenerate}
                disabled={loading}
                className="w-full"
                size="lg"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generando plan con IA...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generar Plan de Entrenamiento
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {plan && (
            <Card>
              <CardHeader>
                <CardTitle>Tu Plan de Entrenamiento</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <ReactMarkdown>{plan}</ReactMarkdown>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default TrainingPlan;
