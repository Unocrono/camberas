import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CreditCard, Lock, AlertCircle, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// Redsys hosted payment page (redirect flow)
const REDSYS_REDIRECT_URL_TEST = "https://sis-t.redsys.es:25443/sis/realizarPago";
const REDSYS_REDIRECT_URL_PROD = "https://sis.redsys.es/sis/realizarPago";

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

export const RedsysPaymentForm = ({
  amount,
  registrationId,
  description,
  userEmail,
  onError,
  onCancel,
  isTest = true,
}: RedsysPaymentFormProps) => {
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentData, setPaymentData] = useState<{
    orderNumber: string;
    merchantParams: string;
    signature: string;
    signatureVersion: string;
  } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

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
    } catch (err: any) {
      console.error("Error initializing payment:", err);
      setError(err.message || "Error al inicializar el pago");
      onError?.(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Redirige a la página de pago de Redsys enviando el formulario oculto.
  // Redsys gestiona la captura de tarjeta y 3D Secure; al terminar
  // redirige a URLOK/URLKO y notifica al webhook (redsys-webhook).
  const handleSubmit = () => {
    if (!formRef.current) return;
    setRedirecting(true);
    formRef.current.submit();
  };

  if (loading) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-3">Preparando el pago...</span>
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
        <div className="bg-muted/30 rounded-lg p-4 text-sm text-muted-foreground text-center space-y-2">
          <p>
            Al pulsar <span className="font-semibold text-foreground">Pagar</span> te
            llevaremos a la pasarela segura de Redsys para completar el pago con tu tarjeta.
          </p>
          <p className="flex items-center justify-center gap-1 text-xs">
            <ExternalLink className="h-3 w-3" />
            Volverás a esta web automáticamente al terminar
          </p>
        </div>

        {paymentData && (
          <form
            ref={formRef}
            action={isTest ? REDSYS_REDIRECT_URL_TEST : REDSYS_REDIRECT_URL_PROD}
            method="POST"
          >
            <input type="hidden" name="Ds_SignatureVersion" value={paymentData.signatureVersion} />
            <input type="hidden" name="Ds_MerchantParameters" value={paymentData.merchantParams} />
            <input type="hidden" name="Ds_Signature" value={paymentData.signature} />
          </form>
        )}

        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Lock className="h-3 w-3" />
          <span>Pago seguro procesado por Redsys</span>
        </div>

        <div className="flex gap-3">
          {onCancel && (
            <Button
              variant="outline"
              onClick={onCancel}
              disabled={redirecting}
              className="flex-1"
            >
              Cancelar
            </Button>
          )}
          <Button
            onClick={handleSubmit}
            disabled={redirecting || !paymentData}
            className="flex-1"
          >
            {redirecting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Redirigiendo...
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
