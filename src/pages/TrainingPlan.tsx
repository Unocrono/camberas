import { useState, useEffect } from "react";
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
import { Loader2, Sparkles, History, Download, Share2, Edit, Trash2, Eye } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ReactMarkdown from "react-markdown";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

interface TrainingPlan {
  id: string;
  goal: string;
  fitness_level: string;
  weeks_until_race: number;
  plan_content: string;
  created_at: string;
  updated_at: string;
}

const TrainingPlan = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<string>("");
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null);
  const [historyPlans, setHistoryPlans] = useState<TrainingPlan[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [editingPlan, setEditingPlan] = useState<TrainingPlan | null>(null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [selectedPlanToShare, setSelectedPlanToShare] = useState<TrainingPlan | null>(null);
  const [formData, setFormData] = useState({
    goal: "",
    fitnessLevel: "",
    weeksUntilRace: "",
    raceDistance: "",
  });

  useEffect(() => {
    if (user) {
      loadHistory();
    }
  }, [user]);

  const loadHistory = async () => {
    if (!user) return;
    
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from("training_plans")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setHistoryPlans(data || []);
    } catch (error) {
      console.error("Error loading history:", error);
      toast({
        title: "Error",
        description: "No se pudo cargar el historial",
        variant: "destructive",
      });
    } finally {
      setLoadingHistory(false);
    }
  };

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
      const { data: savedPlan, error: saveError } = await supabase
        .from("training_plans")
        .insert({
          user_id: user.id,
          goal: formData.goal,
          fitness_level: formData.fitnessLevel,
          weeks_until_race: parseInt(formData.weeksUntilRace),
          plan_content: data.plan,
        })
        .select()
        .single();

      if (saveError) throw saveError;
      
      setCurrentPlanId(savedPlan.id);
      loadHistory();

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

  const handleUpdatePlan = async () => {
    if (!editingPlan || !user) return;

    try {
      const { error } = await supabase
        .from("training_plans")
        .update({ plan_content: editingPlan.plan_content })
        .eq("id", editingPlan.id);

      if (error) throw error;

      toast({
        title: "Plan actualizado",
        description: "El plan se ha actualizado correctamente",
      });

      setEditingPlan(null);
      loadHistory();
    } catch (error) {
      console.error("Error updating plan:", error);
      toast({
        title: "Error",
        description: "No se pudo actualizar el plan",
        variant: "destructive",
      });
    }
  };

  const handleDeletePlan = async (planId: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from("training_plans")
        .delete()
        .eq("id", planId);

      if (error) throw error;

      toast({
        title: "Plan eliminado",
        description: "El plan se ha eliminado correctamente",
      });

      loadHistory();
      if (currentPlanId === planId) {
        setPlan("");
        setCurrentPlanId(null);
      }
    } catch (error) {
      console.error("Error deleting plan:", error);
      toast({
        title: "Error",
        description: "No se pudo eliminar el plan",
        variant: "destructive",
      });
    }
  };

  const handleExportPDF = async (planToExport: TrainingPlan) => {
    try {
      const pdf = new jsPDF();
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
      let yPosition = margin;

      // Title
      pdf.setFontSize(18);
      pdf.text("Plan de Entrenamiento", margin, yPosition);
      yPosition += 10;

      // Details
      pdf.setFontSize(10);
      pdf.text(`Objetivo: ${planToExport.goal}`, margin, yPosition);
      yPosition += 7;
      pdf.text(`Nivel: ${planToExport.fitness_level}`, margin, yPosition);
      yPosition += 7;
      pdf.text(`Semanas: ${planToExport.weeks_until_race}`, margin, yPosition);
      yPosition += 10;

      // Content
      pdf.setFontSize(9);
      const lines = pdf.splitTextToSize(planToExport.plan_content, pageWidth - 2 * margin);
      
      for (let i = 0; i < lines.length; i++) {
        if (yPosition > pageHeight - margin) {
          pdf.addPage();
          yPosition = margin;
        }
        pdf.text(lines[i], margin, yPosition);
        yPosition += 5;
      }

      pdf.save(`plan-entrenamiento-${planToExport.id}.pdf`);

      toast({
        title: "PDF generado",
        description: "El plan se ha exportado correctamente",
      });
    } catch (error) {
      console.error("Error exporting PDF:", error);
      toast({
        title: "Error",
        description: "No se pudo exportar el plan a PDF",
        variant: "destructive",
      });
    }
  };

  const handleSharePlan = (planToShare: TrainingPlan) => {
    setSelectedPlanToShare(planToShare);
    setShareDialogOpen(true);
  };

  const copyShareLink = () => {
    const shareText = `Plan de Entrenamiento\n\nObjetivo: ${selectedPlanToShare?.goal}\nNivel: ${selectedPlanToShare?.fitness_level}\nSemanas: ${selectedPlanToShare?.weeks_until_race}\n\n${selectedPlanToShare?.plan_content}`;
    navigator.clipboard.writeText(shareText);
    toast({
      title: "Copiado",
      description: "El plan se ha copiado al portapapeles",
    });
  };

  const viewPlan = (planToView: TrainingPlan) => {
    setPlan(planToView.plan_content);
    setCurrentPlanId(planToView.id);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto space-y-8">
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-bold flex items-center justify-center gap-2">
              <Sparkles className="w-8 h-8 text-primary" />
              Plan de Entrenamiento Personalizado
            </h1>
            <p className="text-muted-foreground">
              Genera un plan de entrenamiento adaptado a tus objetivos con IA
            </p>
          </div>

          <Tabs defaultValue="generate" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="generate">
                <Sparkles className="w-4 h-4 mr-2" />
                Generar Nuevo Plan
              </TabsTrigger>
              <TabsTrigger value="history">
                <History className="w-4 h-4 mr-2" />
                Mis Planes ({historyPlans.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="generate" className="space-y-8">
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
                    <CardTitle className="flex items-center justify-between">
                      <span>Tu Plan de Entrenamiento</span>
                      <div className="flex gap-2">
                        {currentPlanId && historyPlans.find(p => p.id === currentPlanId) && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleExportPDF(historyPlans.find(p => p.id === currentPlanId)!)}
                            >
                              <Download className="w-4 h-4 mr-2" />
                              Exportar PDF
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleSharePlan(historyPlans.find(p => p.id === currentPlanId)!)}
                            >
                              <Share2 className="w-4 h-4 mr-2" />
                              Compartir
                            </Button>
                          </>
                        )}
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="prose prose-sm max-w-none dark:prose-invert">
                      <ReactMarkdown>{plan}</ReactMarkdown>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="history" className="space-y-4">
              {loadingHistory ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : historyPlans.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <History className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-lg font-semibold mb-2">No hay planes guardados</h3>
                    <p className="text-muted-foreground mb-4">
                      Genera tu primer plan de entrenamiento personalizado
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4">
                  {historyPlans.map((historyPlan) => (
                    <Card key={historyPlan.id}>
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                          <span className="text-lg">{historyPlan.goal}</span>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => viewPlan(historyPlan)}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingPlan(historyPlan)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleExportPDF(historyPlan)}
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSharePlan(historyPlan)}
                            >
                              <Share2 className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeletePlan(historyPlan.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </CardTitle>
                        <CardDescription>
                          Nivel: {historyPlan.fitness_level} • {historyPlan.weeks_until_race} semanas •
                          Creado: {new Date(historyPlan.created_at).toLocaleDateString()}
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Edit Dialog */}
        <Dialog open={!!editingPlan} onOpenChange={(open) => !open && setEditingPlan(null)}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Editar Plan de Entrenamiento</DialogTitle>
              <DialogDescription>
                Modifica el contenido de tu plan de entrenamiento
              </DialogDescription>
            </DialogHeader>
            {editingPlan && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Contenido del Plan</Label>
                  <Textarea
                    value={editingPlan.plan_content}
                    onChange={(e) =>
                      setEditingPlan({ ...editingPlan, plan_content: e.target.value })
                    }
                    rows={15}
                    className="font-mono text-sm"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setEditingPlan(null)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleUpdatePlan}>
                    Guardar Cambios
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Share Dialog */}
        <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Compartir Plan de Entrenamiento</DialogTitle>
              <DialogDescription>
                Comparte tu plan con tu entrenador o cópialo para enviarlo
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Button className="w-full" onClick={copyShareLink}>
                Copiar al Portapapeles
              </Button>
              <p className="text-sm text-muted-foreground text-center">
                El plan se copiará en formato de texto para que puedas compartirlo fácilmente
              </p>
            </div>
          </DialogContent>
        </Dialog>
      </main>
      <Footer />
    </div>
  );
};

export default TrainingPlan;
