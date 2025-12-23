import { useState, useEffect, useCallback, useRef } from 'react';

interface NtpState {
  offset: number; // Diferencia en ms entre hora local y servidor
  lastSync: Date | null;
  isCalculating: boolean;
  calibrationProgress: number; // 0-100 porcentaje de calibración
  error: string | null;
}

const STORAGE_KEY = 'ntp_offset_data';
const SYNC_INTERVAL = 5 * 60 * 1000; // Re-sincronizar cada 5 minutos
const CALIBRATION_DURATION = 5000; // 5 segundos de calibración
const SAMPLE_INTERVAL = 500; // Una muestra cada 500ms

export function useNtpOffset() {
  const [state, setState] = useState<NtpState>({
    offset: 0,
    lastSync: null,
    isCalculating: false,
    calibrationProgress: 0,
    error: null
  });
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const calibrationRef = useRef<boolean>(false);
  const hasInitialCalibrationRef = useRef<boolean>(false);

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

  // Calcular offset usando timestamp del servidor (versión extendida de 5 segundos)
  const calculateOffset = useCallback(async (extendedCalibration: boolean = false): Promise<number> => {
    if (calibrationRef.current) {
      console.log('[NTP] Ya hay una calibración en progreso');
      return state.offset;
    }
    
    calibrationRef.current = true;
    setState(prev => ({ ...prev, isCalculating: true, calibrationProgress: 0, error: null }));
    
    try {
      const samples: number[] = [];
      const startTime = Date.now();
      const duration = extendedCalibration ? CALIBRATION_DURATION : 1500; // 5s o 1.5s
      const totalSamples = Math.floor(duration / SAMPLE_INTERVAL);
      
      console.log(`[NTP] Iniciando calibración ${extendedCalibration ? 'extendida' : 'rápida'} (${duration/1000}s, ${totalSamples} muestras)`);
      
      for (let i = 0; i < totalSamples && calibrationRef.current; i++) {
        const t0 = Date.now();
        
        try {
          const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/races?select=id&limit=1`, {
            headers: {
              'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`
            }
          });
          
          const t3 = Date.now();
          const serverDateHeader = response.headers.get('date');
          
          if (serverDateHeader) {
            const serverTime = new Date(serverDateHeader).getTime();
            // Offset = tiempo local promedio - tiempo servidor
            const offset = ((t0 + t3) / 2) - serverTime;
            samples.push(offset);
          }
        } catch (fetchError) {
          console.warn('[NTP] Error en muestra:', fetchError);
        }
        
        // Actualizar progreso
        const elapsed = Date.now() - startTime;
        const progress = Math.min(100, Math.round((elapsed / duration) * 100));
        setState(prev => ({ ...prev, calibrationProgress: progress }));
        
        // Esperar hasta el siguiente intervalo
        const nextSampleTime = startTime + ((i + 1) * SAMPLE_INTERVAL);
        const waitTime = nextSampleTime - Date.now();
        if (waitTime > 0) {
          await new Promise(r => setTimeout(r, waitTime));
        }
      }
      
      calibrationRef.current = false;
      
      if (samples.length === 0) {
        throw new Error('No se pudo obtener muestras de tiempo');
      }
      
      // Usar la mediana para evitar outliers
      samples.sort((a, b) => a - b);
      // Descartar el 20% extremo si tenemos suficientes muestras
      const trimStart = samples.length >= 5 ? Math.floor(samples.length * 0.1) : 0;
      const trimEnd = samples.length >= 5 ? Math.ceil(samples.length * 0.9) : samples.length;
      const trimmedSamples = samples.slice(trimStart, trimEnd);
      
      // Calcular media de las muestras recortadas
      const avgOffset = trimmedSamples.reduce((a, b) => a + b, 0) / trimmedSamples.length;
      const medianOffset = Math.round(avgOffset);
      
      const ntpData = {
        offset: medianOffset,
        lastSync: new Date().toISOString()
      };
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ntpData));
      
      setState({
        offset: medianOffset,
        lastSync: new Date(),
        isCalculating: false,
        calibrationProgress: 100,
        error: null
      });
      
      console.log(`[NTP] Calibración completada: ${medianOffset}ms (${samples.length} muestras, ${medianOffset > 0 ? 'dispositivo adelantado' : 'dispositivo atrasado'})`);
      
      return medianOffset;
    } catch (error) {
      calibrationRef.current = false;
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      setState(prev => ({ 
        ...prev, 
        isCalculating: false, 
        calibrationProgress: 0,
        error: errorMessage 
      }));
      console.error('[NTP] Error calculando offset:', error);
      return state.offset;
    }
  }, [state.offset]);

  // Corregir un timestamp local aplicando el offset
  const correctTimestamp = useCallback((localTimestamp: number): number => {
    return localTimestamp - state.offset;
  }, [state.offset]);

  // Obtener timestamp corregido actual
  const getCorrectedNow = useCallback((): number => {
    return correctTimestamp(Date.now());
  }, [correctTimestamp]);

  // Calibración inicial extendida (5 segundos) al montar
  useEffect(() => {
    if (hasInitialCalibrationRef.current) return;
    hasInitialCalibrationRef.current = true;
    
    // Calibración extendida al iniciar
    calculateOffset(true);
    
    // Re-sincronización periódica (rápida)
    intervalRef.current = setInterval(() => {
      if (navigator.onLine && !calibrationRef.current) {
        calculateOffset(false); // Calibración rápida
      }
    }, SYNC_INTERVAL);
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      calibrationRef.current = false;
    };
  }, [calculateOffset]);

  // Re-sincronizar cuando vuelve la conexión
  useEffect(() => {
    const handleOnline = () => {
      console.log('[NTP] Conexión restaurada, re-sincronizando...');
      if (!calibrationRef.current) {
        calculateOffset(false);
      }
    };
    
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [calculateOffset]);

  return {
    offset: state.offset,
    lastSync: state.lastSync,
    isCalculating: state.isCalculating,
    calibrationProgress: state.calibrationProgress,
    error: state.error,
    calculateOffset: () => calculateOffset(true), // Manual siempre es extendida
    correctTimestamp,
    getCorrectedNow
  };
}
