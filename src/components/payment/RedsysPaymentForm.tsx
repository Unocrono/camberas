import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CreditCard, Lock, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface RedsysPaymentFormProps {
  amount: number;
  registrationId: string;
  description?: string;
  userEmail?: string;
  onSuccess?: () => void;
  onError?: (error: string) => void;
  onCancel?: () => void;
  isTest?: boolean;
}

declare global {
  interface Window {
    getInSiteForm: (
      id: string,
      style: string,
      fuc: string,
      terminal: string,
      order: string
    ) => void;
    getIdOper: (params: {
      Ds_MerchantParameters: string;
      Ds_SignatureVersion: string;
      Ds_Signature: string;
    }, callback: (response: any) => void) => void;
  }
}

export const RedsysPaymentForm = ({
  amount,
  registrationId,
  description,
  userEmail,
  onSuccess,
  onError,
  onCancel,
  isTest = true,
}: RedsysPaymentFormProps) => {
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentData, setPaymentData] = useState<{
    orderNumber: string;
    merchantParams: string;
    signature: string;
    signatureVersion: string;
    insiteUrl: string;
    redsysUrl: string;
  } | null>(null);
  const { toast } = useToast();

  // Initialize payment
  useEffect(() => {
    initializePayment();
  }, [amount, registrationId]);

  const initializePayment = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fnError } = await supabase.functions.invoke("redsys-init-payment", {
        body: {
          amount,
          registrationId,
          description,
          userEmail,
          isTest,
        },
      });

      if (fnError) throw fnError;
      if (!data.success) throw new Error(data.error || "Error inicializando pago");

      setPaymentData(data);
      
      // Load Redsys inSite script
      loadRedsysScript(data.insiteUrl);
    } catch (err: any) {
      console.error("Error initializing payment:", err);
      setError(err.message || "Error al inicializar el pago");
      onError?.(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadRedsysScript = (scriptUrl: string) => {
    // Check if script already loaded
    if (document.querySelector(`script[src="${scriptUrl}"]`)) {
      initRedsysForm();
      return;
    }

    const script = document.createElement("script");
    script.src = scriptUrl;
    script.async = true;
    script.onload = () => {
      console.log("Redsys script loaded");
      initRedsysForm();
    };
    script.onerror = () => {
      setError("Error cargando el formulario de pago");
    };
    document.body.appendChild(script);
  };

  const initRedsysForm = useCallback(() => {
    if (!paymentData) return;
    
    // Wait for Redsys to be ready
    setTimeout(() => {
      try {
        if (window.getInSiteForm) {
          // Style: unified inline form
          window.getInSiteForm(
            "redsys-form-container",
            "twoRows", // inline, twoRows, or card
            "175883131", // FUC (merchant code)
            "001", // Terminal
            paymentData.orderNumber
          );
        }
      } catch (err) {
        console.error("Error initializing Redsys form:", err);
      }
    }, 500);
  }, [paymentData]);

  const handleSubmit = async () => {
    if (!paymentData) return;

    try {
      setProcessing(true);

      // Get the idOper token from Redsys
      window.getIdOper(
        {
          Ds_MerchantParameters: paymentData.merchantParams,
          Ds_SignatureVersion: paymentData.signatureVersion,
          Ds_Signature: paymentData.signature,
        },
        async (response) => {
          if (response.errorCode) {
            const errorMsg = getRedsysErrorMessage(response.errorCode);
            setError(errorMsg);
            onError?.(errorMsg);
            setProcessing(false);
            return;
          }

          if (response.Ds_MerchantParameters) {
            // Payment successful - the webhook will handle the rest
            toast({
              title: "Pago procesado",
              description: "Tu pago está siendo verificado...",
            });
            onSuccess?.();
          }
        }
      );
    } catch (err: any) {
      console.error("Payment error:", err);
      setError(err.message || "Error procesando el pago");
      onError?.(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const getRedsysErrorMessage = (code: string): string => {
    const errors: Record<string, string> = {
      "SIS0051": "Tarjeta caducada",
      "SIS0059": "Operación cancelada",
      "SIS0093": "Tarjeta no válida",
      "SIS0094": "Error en datos de tarjeta",
      "SIS0112": "Tarjeta no permite operación",
      "SIS0253": "Tarjeta no identificada",
      "MSG0000": "Error de conexión",
    };
    return errors[code] || `Error de pago (${code})`;
  };

  if (loading) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-3">Cargando formulario de pago...</span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full max-w-md mx-auto border-destructive">
        <CardContent className="py-8">
          <div className="flex flex-col items-center text-center gap-4">
            <AlertCircle className="h-12 w-12 text-destructive" />
            <div>
              <h3 className="font-semibold text-lg">Error en el pago</h3>
              <p className="text-muted-foreground mt-1">{error}</p>
            </div>
            <Button onClick={initializePayment} variant="outline">
              Reintentar
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center pb-4">
        <CardTitle className="flex items-center justify-center gap-2">
          <CreditCard className="h-5 w-5" />
          Pago con Tarjeta
        </CardTitle>
        <p className="text-2xl font-bold text-primary">
          {amount.toFixed(2)} €
        </p>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Redsys inSite form container */}
        <div 
          id="redsys-form-container" 
          className="min-h-[120px] bg-muted/30 rounded-lg p-4"
        />

        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Lock className="h-3 w-3" />
          <span>Pago seguro procesado por Redsys</span>
        </div>

        <div className="flex gap-3">
          {onCancel && (
            <Button 
              variant="outline" 
              onClick={onCancel}
              disabled={processing}
              className="flex-1"
            >
              Cancelar
            </Button>
          )}
          <Button 
            onClick={handleSubmit}
            disabled={processing}
            className="flex-1"
          >
            {processing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Procesando...
              </>
            ) : (
              `Pagar ${amount.toFixed(2)} €`
            )}
          </Button>
        </div>

        {isTest && (
          <p className="text-xs text-center text-amber-600 bg-amber-50 p-2 rounded">
            ⚠️ Modo de pruebas - No se realizarán cargos reales
          </p>
        )}
      </CardContent>
    </Card>
  );
};
