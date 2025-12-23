import { useState, useEffect, useCallback, useRef } from 'react';

interface NtpState {
  offset: number; // Diferencia en ms entre hora local y servidor
  lastSync: Date | null;
  isCalculating: boolean;
  error: string | null;
}

const STORAGE_KEY = 'ntp_offset_data';
const SYNC_INTERVAL = 5 * 60 * 1000; // Re-sincronizar cada 5 minutos

export function useNtpOffset() {
  const [state, setState] = useState<NtpState>({
    offset: 0,
    lastSync: null,
    isCalculating: false,
    error: null
  });
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Cargar offset guardado al iniciar
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const data = JSON.parse(stored);
        setState(prev => ({
          ...prev,
          offset: data.offset || 0,
          lastSync: data.lastSync ? new Date(data.lastSync) : null
        }));
      } catch (e) {
        console.warn('Error loading NTP offset from storage:', e);
      }
    }
  }, []);

  // Calcular offset usando timestamp del servidor
  const calculateOffset = useCallback(async (): Promise<number> => {
    setState(prev => ({ ...prev, isCalculating: true, error: null }));
    
    try {
      // Múltiples muestras para mayor precisión
      const samples: number[] = [];
      
      for (let i = 0; i < 3; i++) {
        const t0 = Date.now(); // Tiempo local antes de la petición
        
        // Usar la cabecera Date del servidor como referencia de tiempo
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/races?select=id&limit=1`, {
          headers: {
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`
          }
        });
        
        const t3 = Date.now(); // Tiempo local después de la petición
        const serverDateHeader = response.headers.get('date');
        
        if (serverDateHeader) {
          const serverTime = new Date(serverDateHeader).getTime();
          const rtt = t3 - t0;
          // Offset = tiempo local - tiempo servidor (ajustado por RTT)
          const offset = ((t0 + t3) / 2) - serverTime;
          samples.push(offset);
        }
        
        // Pequeña pausa entre muestras
        await new Promise(r => setTimeout(r, 100));
      }
      
      if (samples.length === 0) {
        throw new Error('No se pudo obtener muestras de tiempo');
      }
      
      // Usar la mediana para evitar outliers
      samples.sort((a, b) => a - b);
      const medianOffset = samples[Math.floor(samples.length / 2)];
      
      const ntpData = {
        offset: medianOffset,
        lastSync: new Date().toISOString()
      };
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ntpData));
      
      setState({
        offset: medianOffset,
        lastSync: new Date(),
        isCalculating: false,
        error: null
      });
      
      console.log(`[NTP] Offset calculado: ${medianOffset}ms (${medianOffset > 0 ? 'adelantado' : 'atrasado'})`);
      
      return medianOffset;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      setState(prev => ({ 
        ...prev, 
        isCalculating: false, 
        error: errorMessage 
      }));
      console.error('[NTP] Error calculando offset:', error);
      return state.offset; // Mantener el offset anterior
    }
  }, [state.offset]);

  // Corregir un timestamp local aplicando el offset
  const correctTimestamp = useCallback((localTimestamp: number): number => {
    // Si el dispositivo está adelantado (offset > 0), restamos
    // Si está atrasado (offset < 0), sumamos
    return localTimestamp - state.offset;
  }, [state.offset]);

  // Obtener timestamp corregido actual
  const getCorrectedNow = useCallback((): number => {
    return correctTimestamp(Date.now());
  }, [correctTimestamp]);

  // Sincronización automática periódica
  useEffect(() => {
    // Calcular al montar
    calculateOffset();
    
    // Re-sincronizar periódicamente
    intervalRef.current = setInterval(() => {
      if (navigator.onLine) {
        calculateOffset();
      }
    }, SYNC_INTERVAL);
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [calculateOffset]);

  // Re-sincronizar cuando vuelve la conexión
  useEffect(() => {
    const handleOnline = () => {
      console.log('[NTP] Conexión restaurada, re-sincronizando...');
      calculateOffset();
    };
    
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [calculateOffset]);

  return {
    offset: state.offset,
    lastSync: state.lastSync,
    isCalculating: state.isCalculating,
    error: state.error,
    calculateOffset,
    correctTimestamp,
    getCorrectedNow
  };
}
