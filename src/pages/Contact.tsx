import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Mail, MessageSquare, Phone, Loader2 } from "lucide-react";
import { z } from "zod";

const contactSchema = z.object({
  name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres").max(100),
  email: z.string().trim().email("Email inválido").max(255),
  subject: z.string().trim().min(3, "El asunto debe tener al menos 3 caracteres").max(200),
  message: z.string().trim().min(10, "El mensaje debe tener al menos 10 caracteres").max(2000),
});

interface ContactSettings {
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

export default function Contact() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [loading, setLoading] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [settings, setSettings] = useState<ContactSettings>({
    support_email: "soporte@camberas.com",
    whatsapp_number: "+34 600 000 000",
    whatsapp_url: "https://wa.me/34600000000",
    form_enabled: true,
    page_title: "Contacta con nosotros",
    page_description: "¿Tienes alguna pregunta? Estamos aquí para ayudarte",
    form_title: "Envíanos un mensaje",
    form_description: "Completa el formulario y te responderemos por email",
    success_message: "Te responderemos lo antes posible por email.",
    email_card_visible: true,
    whatsapp_card_visible: true,
    support_chat_card_visible: true,
  });

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
      if (data) setSettings(data);
    } catch (error) {
      console.error("Error loading contact settings:", error);
    } finally {
      setLoadingSettings(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const validatedData = contactSchema.parse(formData);
      setLoading(true);
      setErrors({});

      const { error } = await supabase.functions.invoke("send-contact-email", {
        body: validatedData,
      });

      if (error) throw error;

      toast.success("¡Mensaje enviado!", {
        description: settings.success_message,
      });

      setFormData({ name: "", email: "", subject: "", message: "" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            fieldErrors[err.path[0] as string] = err.message;
          }
        });
        setErrors(fieldErrors);
        toast.error("Por favor, revisa los campos del formulario");
      } else {
        console.error("Error sending contact email:", error);
        toast.error("Error al enviar el mensaje. Inténtalo de nuevo.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (loadingSettings) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4 text-foreground">{settings.page_title}</h1>
          <p className="text-lg text-muted-foreground">
            {settings.page_description}
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-12">
          {settings.email_card_visible && (
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardHeader>
                <Mail className="h-8 w-8 mb-2 text-primary" />
                <CardTitle className="text-lg">Email</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{settings.support_email}</p>
              </CardContent>
            </Card>
          )}

          {settings.whatsapp_card_visible && (
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardHeader>
                <Phone className="h-8 w-8 mb-2 text-primary" />
                <CardTitle className="text-lg">WhatsApp</CardTitle>
              </CardHeader>
              <CardContent>
                <a 
                  href={settings.whatsapp_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline"
                >
                  {settings.whatsapp_number}
                </a>
              </CardContent>
            </Card>
          )}

          {settings.support_chat_card_visible && (
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardHeader>
                <MessageSquare className="h-8 w-8 mb-2 text-primary" />
                <CardTitle className="text-lg">Soporte</CardTitle>
              </CardHeader>
              <CardContent>
                <Button 
                  variant="link" 
                  className="text-sm p-0 h-auto"
                  onClick={() => navigate("/support")}
                >
                  Chat en la app
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {settings.form_enabled ? (
          <Card className="bg-card backdrop-blur border-border">
            <CardHeader>
              <CardTitle>{settings.form_title}</CardTitle>
              <CardDescription>
                {settings.form_description}
              </CardDescription>
            </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nombre *</Label>
                  <Input
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="Tu nombre"
                    className={errors.name ? "border-destructive" : ""}
                  />
                  {errors.name && (
                    <p className="text-sm text-destructive">{errors.name}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="tu@email.com"
                    className={errors.email ? "border-destructive" : ""}
                  />
                  {errors.email && (
                    <p className="text-sm text-destructive">{errors.email}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="subject">Asunto *</Label>
                <Input
                  id="subject"
                  name="subject"
                  value={formData.subject}
                  onChange={handleChange}
                  placeholder="¿En qué podemos ayudarte?"
                  className={errors.subject ? "border-destructive" : ""}
                />
                {errors.subject && (
                  <p className="text-sm text-destructive">{errors.subject}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="message">Mensaje *</Label>
                <Textarea
                  id="message"
                  name="message"
                  value={formData.message}
                  onChange={handleChange}
                  placeholder="Cuéntanos más sobre tu consulta..."
                  rows={6}
                  className={errors.message ? "border-destructive" : ""}
                />
                {errors.message && (
                  <p className="text-sm text-destructive">{errors.message}</p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Enviando..." : "Enviar mensaje"}
              </Button>
            </form>
          </CardContent>
        </Card>
        ) : (
          <Card className="bg-card backdrop-blur border-border">
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground">
                El formulario de contacto no está disponible en este momento. 
                Por favor, contacta con nosotros a través de los canales alternativos mostrados arriba.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
