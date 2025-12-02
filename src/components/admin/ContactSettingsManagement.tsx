import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Loader2, Save, Mail, MessageSquare } from "lucide-react";

interface ContactSettings {
  id: string;
  support_email: string;
  whatsapp_number: string;
  whatsapp_url: string;
  form_enabled: boolean;
  page_title: string;
  page_description: string;
  form_title: string;
  form_description: string;
  success_message: string;
  email_card_visible: boolean;
  whatsapp_card_visible: boolean;
  support_chat_card_visible: boolean;
}

export default function ContactSettingsManagement() {
  const [settings, setSettings] = useState<ContactSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("contact_settings")
        .select("*")
        .single();

      if (error) throw error;
      setSettings(data);
    } catch (error) {
      console.error("Error loading contact settings:", error);
      toast.error("Error al cargar configuración");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;

    try {
      setSaving(true);
      const { error } = await supabase
        .from("contact_settings")
        .update({
          support_email: settings.support_email,
          whatsapp_number: settings.whatsapp_number,
          whatsapp_url: settings.whatsapp_url,
          form_enabled: settings.form_enabled,
          page_title: settings.page_title,
          page_description: settings.page_description,
          form_title: settings.form_title,
          form_description: settings.form_description,
          success_message: settings.success_message,
          email_card_visible: settings.email_card_visible,
          whatsapp_card_visible: settings.whatsapp_card_visible,
          support_chat_card_visible: settings.support_chat_card_visible,
        })
        .eq("id", settings.id);

      if (error) throw error;

      toast.success("Configuración guardada correctamente");
    } catch (error) {
      console.error("Error saving contact settings:", error);
      toast.error("Error al guardar configuración");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No se pudo cargar la configuración
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Mail className="h-6 w-6" />
            Configuración de Contacto
          </h2>
          <p className="text-muted-foreground">
            Gestiona la información de contacto y el formulario
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Guardando...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Guardar Cambios
            </>
          )}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Información de Contacto</CardTitle>
          <CardDescription>Datos que se muestran en la página de contacto</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="support_email">Email de Soporte *</Label>
            <Input
              id="support_email"
              type="email"
              value={settings.support_email}
              onChange={(e) => setSettings({ ...settings, support_email: e.target.value })}
              placeholder="soporte@camberas.com"
            />
            <p className="text-sm text-muted-foreground">
              Email donde llegarán los mensajes del formulario
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="whatsapp_number">Número de WhatsApp</Label>
              <Input
                id="whatsapp_number"
                value={settings.whatsapp_number}
                onChange={(e) => setSettings({ ...settings, whatsapp_number: e.target.value })}
                placeholder="+34 600 000 000"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="whatsapp_url">URL de WhatsApp</Label>
              <Input
                id="whatsapp_url"
                value={settings.whatsapp_url}
                onChange={(e) => setSettings({ ...settings, whatsapp_url: e.target.value })}
                placeholder="https://wa.me/34600000000"
              />
              <p className="text-sm text-muted-foreground">
                Incluye código de país sin +
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Textos de la Página</CardTitle>
          <CardDescription>Personaliza los mensajes que ve el usuario</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="page_title">Título de la Página</Label>
            <Input
              id="page_title"
              value={settings.page_title}
              onChange={(e) => setSettings({ ...settings, page_title: e.target.value })}
              placeholder="Contacta con nosotros"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="page_description">Descripción de la Página</Label>
            <Textarea
              id="page_description"
              value={settings.page_description}
              onChange={(e) => setSettings({ ...settings, page_description: e.target.value })}
              placeholder="¿Tienes alguna pregunta? Estamos aquí para ayudarte"
              rows={2}
            />
          </div>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="form_title">Título del Formulario</Label>
            <Input
              id="form_title"
              value={settings.form_title}
              onChange={(e) => setSettings({ ...settings, form_title: e.target.value })}
              placeholder="Envíanos un mensaje"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="form_description">Descripción del Formulario</Label>
            <Textarea
              id="form_description"
              value={settings.form_description}
              onChange={(e) => setSettings({ ...settings, form_description: e.target.value })}
              placeholder="Completa el formulario y te responderemos por email"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="success_message">Mensaje de Éxito</Label>
            <Textarea
              id="success_message"
              value={settings.success_message}
              onChange={(e) => setSettings({ ...settings, success_message: e.target.value })}
              placeholder="Te responderemos lo antes posible por email."
              rows={2}
            />
            <p className="text-sm text-muted-foreground">
              Se muestra después de enviar el formulario
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Visibilidad y Estado</CardTitle>
          <CardDescription>Controla qué elementos se muestran</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="form_enabled">Formulario de Contacto</Label>
              <p className="text-sm text-muted-foreground">
                Activar/desactivar el formulario completamente
              </p>
            </div>
            <Switch
              id="form_enabled"
              checked={settings.form_enabled}
              onCheckedChange={(checked) => setSettings({ ...settings, form_enabled: checked })}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="email_card_visible">Tarjeta de Email</Label>
              <p className="text-sm text-muted-foreground">
                Mostrar información del email de soporte
              </p>
            </div>
            <Switch
              id="email_card_visible"
              checked={settings.email_card_visible}
              onCheckedChange={(checked) => setSettings({ ...settings, email_card_visible: checked })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="whatsapp_card_visible">Tarjeta de WhatsApp</Label>
              <p className="text-sm text-muted-foreground">
                Mostrar enlace a WhatsApp
              </p>
            </div>
            <Switch
              id="whatsapp_card_visible"
              checked={settings.whatsapp_card_visible}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, whatsapp_card_visible: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="support_chat_card_visible">Tarjeta de Chat de Soporte</Label>
              <p className="text-sm text-muted-foreground">
                Mostrar enlace al chat interno
              </p>
            </div>
            <Switch
              id="support_chat_card_visible"
              checked={settings.support_chat_card_visible}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, support_chat_card_visible: checked })
              }
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
