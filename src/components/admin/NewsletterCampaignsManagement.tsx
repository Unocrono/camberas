import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Search, Edit, Trash2, Send, Eye, Loader2, Mail, FileText, Users } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import ReactMarkdown from "react-markdown";

interface Campaign {
  id: string;
  subject: string;
  preview_text: string | null;
  content: string;
  status: string;
  target_segments: string[] | null;
  created_at: string;
  scheduled_at: string | null;
  sent_at: string | null;
  created_by: string | null;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Borrador", variant: "secondary" },
  scheduled: { label: "Programada", variant: "outline" },
  sending: { label: "Enviando", variant: "default" },
  sent: { label: "Enviada", variant: "default" },
  failed: { label: "Error", variant: "destructive" },
};

const segmentLabels: Record<string, string> = {
  general: "General",
  runners: "Corredores",
  organizers: "Organizadores",
  trail: "Trail Running",
  road: "Asfalto",
  mtb: "MTB",
};

const availableSegments = Object.keys(segmentLabels);

export default function NewsletterCampaignsManagement() {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [deleteCampaign, setDeleteCampaign] = useState<Campaign | null>(null);
  const [sendCampaign, setSendCampaign] = useState<Campaign | null>(null);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [subscriberCount, setSubscriberCount] = useState(0);

  // Form state
  const [formData, setFormData] = useState({
    subject: "",
    preview_text: "",
    content: "",
    target_segments: [] as string[],
  });

  useEffect(() => {
    fetchCampaigns();
    fetchSubscriberCount();
  }, []);

  const fetchCampaigns = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("newsletter_campaigns")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setCampaigns(data || []);
    } catch (error) {
      console.error("Error fetching campaigns:", error);
      toast.error("Error al cargar las campañas");
    } finally {
      setLoading(false);
    }
  };

  const fetchSubscriberCount = async () => {
    const { count } = await supabase
      .from("newsletter_subscribers")
      .select("*", { count: "exact", head: true })
      .eq("status", "confirmed");
    setSubscriberCount(count || 0);
  };

  const handleCreate = () => {
    setSelectedCampaign(null);
    setFormData({
      subject: "",
      preview_text: "",
      content: "",
      target_segments: [],
    });
    setIsEditorOpen(true);
  };

  const handleEdit = (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    setFormData({
      subject: campaign.subject,
      preview_text: campaign.preview_text || "",
      content: campaign.content,
      target_segments: campaign.target_segments || [],
    });
    setIsEditorOpen(true);
  };

  const handlePreview = (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    setIsPreviewOpen(true);
  };

  const handleSave = async () => {
    if (!formData.subject.trim() || !formData.content.trim()) {
      toast.error("El asunto y contenido son obligatorios");
      return;
    }

    setSaving(true);
    try {
      const campaignData = {
        subject: formData.subject,
        preview_text: formData.preview_text || null,
        content: formData.content,
        target_segments: formData.target_segments.length > 0 ? formData.target_segments : null,
        created_by: user?.id,
        status: "draft",
      };

      if (selectedCampaign) {
        const { error } = await supabase
          .from("newsletter_campaigns")
          .update(campaignData)
          .eq("id", selectedCampaign.id);
        if (error) throw error;
        toast.success("Campaña actualizada");
      } else {
        const { error } = await supabase
          .from("newsletter_campaigns")
          .insert(campaignData);
        if (error) throw error;
        toast.success("Campaña creada");
      }

      setIsEditorOpen(false);
      fetchCampaigns();
    } catch (error) {
      console.error("Error saving campaign:", error);
      toast.error("Error al guardar la campaña");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteCampaign) return;

    try {
      const { error } = await supabase
        .from("newsletter_campaigns")
        .delete()
        .eq("id", deleteCampaign.id);

      if (error) throw error;
      toast.success("Campaña eliminada");
      fetchCampaigns();
    } catch (error) {
      console.error("Error deleting campaign:", error);
      toast.error("Error al eliminar la campaña");
    } finally {
      setDeleteCampaign(null);
    }
  };

  const handleSend = async () => {
    if (!sendCampaign) return;

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-newsletter", {
        body: { campaignId: sendCampaign.id },
      });

      if (error) throw error;

      toast.success(`Newsletter enviada a ${data?.sent || 0} suscriptores`);
      fetchCampaigns();
    } catch (error: any) {
      console.error("Error sending newsletter:", error);
      toast.error(error.message || "Error al enviar la newsletter");
    } finally {
      setSending(false);
      setSendCampaign(null);
    }
  };

  const handleSegmentChange = (segment: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      target_segments: checked
        ? [...prev.target_segments, segment]
        : prev.target_segments.filter(s => s !== segment),
    }));
  };

  const filteredCampaigns = campaigns.filter((campaign) =>
    campaign.subject.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Campañas</span>
            </div>
            <p className="text-2xl font-bold">{campaigns.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Suscriptores activos</span>
            </div>
            <p className="text-2xl font-bold">{subscriberCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Enviadas</span>
            </div>
            <p className="text-2xl font-bold text-green-600">
              {campaigns.filter(c => c.status === "sent").length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Edit className="h-4 w-4 text-yellow-500" />
              <span className="text-sm text-muted-foreground">Borradores</span>
            </div>
            <p className="text-2xl font-bold text-yellow-600">
              {campaigns.filter(c => c.status === "draft").length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Campañas Newsletter
          </CardTitle>
          <Button onClick={handleCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Nueva Campaña
          </Button>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar campañas..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredCampaigns.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm ? "No se encontraron campañas" : "No hay campañas creadas"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Asunto</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Segmentos</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCampaigns.map((campaign) => (
                    <TableRow key={campaign.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium line-clamp-1">{campaign.subject}</p>
                          {campaign.preview_text && (
                            <p className="text-xs text-muted-foreground line-clamp-1">
                              {campaign.preview_text}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusConfig[campaign.status]?.variant || "secondary"}>
                          {statusConfig[campaign.status]?.label || campaign.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {campaign.target_segments?.map(segment => (
                            <Badge key={segment} variant="outline" className="text-xs">
                              {segmentLabels[segment] || segment}
                            </Badge>
                          )) || <span className="text-muted-foreground text-sm">Todos</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        {campaign.sent_at
                          ? format(new Date(campaign.sent_at), "dd/MM/yyyy HH:mm", { locale: es })
                          : format(new Date(campaign.created_at), "dd/MM/yyyy", { locale: es })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handlePreview(campaign)}
                            title="Vista previa"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {campaign.status === "draft" && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEdit(campaign)}
                                title="Editar"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setSendCampaign(campaign)}
                                title="Enviar"
                                className="text-green-600 hover:text-green-700"
                              >
                                <Send className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteCampaign(campaign)}
                            title="Eliminar"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Editor Dialog */}
      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedCampaign ? "Editar Campaña" : "Nueva Campaña"}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="subject">Asunto *</Label>
              <Input
                id="subject"
                value={formData.subject}
                onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                placeholder="Asunto del email"
              />
            </div>

            <div>
              <Label htmlFor="preview_text">Texto de vista previa</Label>
              <Input
                id="preview_text"
                value={formData.preview_text}
                onChange={(e) => setFormData(prev => ({ ...prev, preview_text: e.target.value }))}
                placeholder="Texto que aparece en la bandeja de entrada"
              />
            </div>

            <div>
              <Label>Contenido *</Label>
              <Tabs defaultValue="edit" className="mt-2">
                <TabsList>
                  <TabsTrigger value="edit">Editar</TabsTrigger>
                  <TabsTrigger value="preview">Vista previa</TabsTrigger>
                </TabsList>
                <TabsContent value="edit" className="mt-2">
                  <Textarea
                    id="content"
                    value={formData.content}
                    onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                    placeholder="Escribe el contenido en Markdown o HTML..."
                    rows={14}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Soporta Markdown y HTML. Usa {"{{name}}"} para insertar el nombre del suscriptor.
                  </p>
                </TabsContent>
                <TabsContent value="preview" className="mt-2">
                  <div className="border rounded-md p-4 min-h-[300px] bg-background prose prose-sm max-w-none dark:prose-invert">
                    {formData.content ? (
                      <ReactMarkdown>{formData.content.replace(/\{\{name\}\}/g, "Juan")}</ReactMarkdown>
                    ) : (
                      <p className="text-muted-foreground italic">Sin contenido para previsualizar</p>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            <div>
              <Label>Segmentos objetivo</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Deja vacío para enviar a todos los suscriptores confirmados
              </p>
              <div className="flex flex-wrap gap-4">
                {availableSegments.map(segment => (
                  <div key={segment} className="flex items-center gap-2">
                    <Checkbox
                      id={`segment-${segment}`}
                      checked={formData.target_segments.includes(segment)}
                      onCheckedChange={(checked) => handleSegmentChange(segment, checked as boolean)}
                    />
                    <Label htmlFor={`segment-${segment}`} className="font-normal cursor-pointer">
                      {segmentLabels[segment]}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditorOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Vista previa: {selectedCampaign?.subject}</DialogTitle>
          </DialogHeader>
          <div 
            className="border rounded-lg p-4 bg-white"
            dangerouslySetInnerHTML={{ __html: selectedCampaign?.content || "" }}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteCampaign} onOpenChange={() => setDeleteCampaign(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar campaña?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará permanentemente la campaña
              "{deleteCampaign?.subject}".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Send Confirmation */}
      <AlertDialog open={!!sendCampaign} onOpenChange={() => !sending && setSendCampaign(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Enviar newsletter?</AlertDialogTitle>
            <AlertDialogDescription>
              Se enviará la newsletter "{sendCampaign?.subject}" a {subscriberCount} suscriptores confirmados
              {sendCampaign?.target_segments?.length ? ` (filtrado por segmentos: ${sendCampaign.target_segments.map(s => segmentLabels[s]).join(", ")})` : ""}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleSend} disabled={sending}>
              {sending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Enviar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
