import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, Mail, CheckCircle } from "lucide-react";

interface NewsletterFormProps {
  source?: string;
  segments?: string[];
  className?: string;
}

export default function NewsletterForm({ 
  source = "footer", 
  segments = ["general"],
  className = ""
}: NewsletterFormProps) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim()) {
      toast.error("Introduce tu email");
      return;
    }

    // Validar formato email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error("Email no válido");
      return;
    }

    try {
      setLoading(true);

      // Llamar a edge function para suscripción con double opt-in
      const { data, error } = await supabase.functions.invoke("newsletter-subscribe", {
        body: { email, source, segments }
      });

      if (error) throw error;

      if (data?.already_subscribed) {
        toast.info("Este email ya está suscrito");
      } else {
        setSuccess(true);
        toast.success("¡Gracias! Revisa tu email para confirmar la suscripción");
      }
      
      setEmail("");
    } catch (error: any) {
      console.error("Newsletter error:", error);
      toast.error(error.message || "Error al suscribirse");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className={`flex items-center gap-2 text-green-500 ${className}`}>
        <CheckCircle className="h-5 w-5" />
        <span className="text-sm">¡Revisa tu email para confirmar!</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={`flex gap-2 ${className}`}>
      <div className="relative flex-1">
        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@email.com"
          className="pl-9"
          disabled={loading}
        />
      </div>
      <Button type="submit" disabled={loading} size="sm">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          "Suscribir"
        )}
      </Button>
    </form>
  );
}
