import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { goal, fitnessLevel, weeksUntilRace, raceDistance } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `Eres un entrenador profesional de trail. Genera un plan de entrenamiento personalizado detallado y estructurado en formato markdown. 

El plan debe incluir:
- Resumen del objetivo y nivel del atleta
- Tabla semanal con días de entrenamiento específicos
- Distancias, ritmos y tipo de entrenamiento por día
- Días de descanso estratégicos
- Consejos de nutrición e hidratación
- Recomendaciones de equipamiento
- Progresión gradual del volumen e intensidad

Usa formato markdown con tablas, listas y secciones bien organizadas.`;

    const userPrompt = `Genera un plan de entrenamiento para:
- Objetivo: ${goal}
- Nivel de condición física: ${fitnessLevel}
- Semanas hasta la carrera: ${weeksUntilRace}
- Distancia de la carrera: ${raceDistance}km

Crea un plan detallado semana por semana.`;

    console.log("Generating training plan with Lovable AI");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const plan = data.choices[0].message.content;

    return new Response(JSON.stringify({ plan }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error("Error in generate-training-plan function:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
