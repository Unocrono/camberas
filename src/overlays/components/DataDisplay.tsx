// src/overlays/components/DataDisplay.tsx

/**
 * CAMBERAS OVERLAY SYSTEM - DATA DISPLAY COMPONENT
 * Componente reutilizable para mostrar datos en overlays con animaciones
 */

import { motion, useSpring, useTransform } from 'framer-motion';
import { useState, useEffect } from 'react';
import type { DataDisplayProps } from '../core/types';
import { getFontFamily, hexToRgba } from '../core/utils';

/**
 * Componente para mostrar valores numéricos animados
 */
export const AnimatedNumber = ({
  value,
  decimals = 0,
  suffix = '',
  style,
  showGlow = false,
}: {
  value: number;
  decimals?: number;
  suffix?: string;
  style: React.CSSProperties;
  showGlow?: boolean;
}) => {
  const spring = useSpring(value, {
    stiffness: 100,
    damping: 30,
    mass: 1,
  });

  const display = useTransform(spring, (val) => val.toFixed(decimals));
  const [displayValue, setDisplayValue] = useState(value.toFixed(decimals));

  useEffect(() => {
    spring.set(value);
  }, [value, spring]);

  useEffect(() => {
    const unsubscribe = display.on('change', (v) => {
      setDisplayValue(v);
    });
    return unsubscribe;
  }, [display]);

  return (
    <motion.span
      style={style}
      animate={{
        textShadow: showGlow
          ? [
              '2px 2px 4px rgba(0,0,0,0.5)',
              '0 0 20px rgba(255,215,0,0.8), 0 0 40px rgba(255,215,0,0.6)',
              '2px 2px 4px rgba(0,0,0,0.5)',
            ]
          : '2px 2px 4px rgba(0,0,0,0.5)',
      }}
      transition={{ duration: 0.5, times: [0, 0.5, 1] }}
    >
      {displayValue}
      {suffix}
    </motion.span>
  );
};

/**
 * Componente para mostrar texto animado (valores manuales)
 */
export const AnimatedText = ({
  value,
  suffix = '',
  style,
  showGlow = false,
}: {
  value: string;
  suffix?: string;
  style: React.CSSProperties;
  showGlow?: boolean;
}) => {
  return (
    <motion.span
      key={value}
      style={style}
      initial={{ opacity: 0, y: 10 }}
      animate={{
        opacity: 1,
        y: 0,
        textShadow: showGlow
          ? [
              '2px 2px 4px rgba(0,0,0,0.5)',
              '0 0 20px rgba(255,215,0,0.8), 0 0 40px rgba(255,215,0,0.6)',
              '2px 2px 4px rgba(0,0,0,0.5)',
            ]
          : '2px 2px 4px rgba(0,0,0,0.5)',
      }}
      transition={{
        opacity: { duration: 0.2 },
        y: { type: 'spring', stiffness: 300, damping: 30 },
        textShadow: { duration: 0.5, times: [0, 0.5, 1] },
      }}
    >
      {value}
      {suffix}
    </motion.span>
  );
};

/**
 * Componente principal para mostrar datos con estilo configurable
 * 
 * @example
 * ```tsx
 * <DataDisplay
 *   label="VELOCIDAD"
 *   value={145}
 *   suffix=" km/h"
 *   config={{
 *     font: "Bebas Neue",
 *     size: 72,
 *     color: "#FFFFFF",
 *     bgColor: "#000000",
 *     bgOpacity: 0.7,
 *     posX: 50,
 *     posY: 85,
 *     scale: 1.0,
 *   }}
 *   animated={true}
 * />
 * ```
 */
export const DataDisplay = ({
  label,
  value,
  suffix = '',
  config,
  isManual = false,
  animated = true,
  showGlow = false,
}: DataDisplayProps) => {
  const containerStyle: React.CSSProperties = {
    fontFamily: getFontFamily(config.font),
    fontSize: `${config.size}px`,
    color: config.color,
    backgroundColor: hexToRgba(config.bgColor, config.bgOpacity),
    padding: label ? '12px 24px' : '8px 16px',
    borderRadius: '8px',
    textAlign: 'center',
    display: 'inline-block',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '0.4em',
    opacity: 0.7,
    display: 'block',
    marginBottom: '2px',
  };

  const isNumeric = typeof value === 'number';
  const stringValue = typeof value === 'string' ? value : value.toString();

  return (
    <div style={containerStyle}>
      {label && <div style={labelStyle}>{label}</div>}
      {animated && isNumeric ? (
        <AnimatedNumber
          value={value as number}
          decimals={stringValue.includes('.') ? 1 : 0}
          suffix={suffix}
          style={{}}
          showGlow={showGlow || isManual}
        />
      ) : (
        <AnimatedText
          value={stringValue}
          suffix={suffix}
          style={{}}
          showGlow={showGlow || isManual}
        />
      )}
    </div>
  );
};

/**
 * Wrapper para posicionar elementos en el overlay
 */
export const PositionWrapper = ({
  children,
  posX,
  posY,
  scale = 1.0,
  visible = true,
  animate = true,
}: {
  children: React.ReactNode;
  posX: number;
  posY: number;
  scale?: number;
  visible?: boolean;
  animate?: boolean;
}) => {
  const springConfig = {
    type: 'spring' as const,
    stiffness: 200,
    damping: 25,
    mass: 1.2,
  };

  if (!visible) return null;

  return (
    <motion.div
      initial={animate ? { opacity: 0, scale: 0.8 } : undefined}
      animate={{ opacity: 1, scale: 1 }}
      exit={animate ? { opacity: 0, scale: 0.8 } : undefined}
      transition={animate ? springConfig : undefined}
      style={{
        position: 'absolute',
        left: `${posX}%`,
        top: `${posY}%`,
        transform: `translate(-50%, -50%) scale(${scale})`,
        pointerEvents: 'none',
      }}
    >
      {children}
    </motion.div>
  );
};

/**
 * Contenedor base para overlays con fondo transparente
 * Optimizado para vMix/OBS browser sources
 */
export const OverlayContainer = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  // Asegurar transparencia del fondo y ocultar elementos no deseados
  useEffect(() => {
    // Hacer fondo transparente
    document.documentElement.style.background = 'transparent';
    document.documentElement.style.backgroundColor = 'transparent';
    document.body.style.background = 'transparent';
    document.body.style.backgroundColor = 'transparent';

    const root = document.getElementById('root');
    if (root) {
      root.style.background = 'transparent';
      root.style.backgroundColor = 'transparent';
    }

    // Ocultar toasters y otros elementos de notificación
    // que pueden interferir con vMix
    const hideNotifications = () => {
      const notificationElements = document.querySelectorAll(
        '[role="region"][aria-label*="Notifications"], section[aria-label*="Notifications"], [data-sonner-toaster]'
      );
      notificationElements.forEach((el) => {
        (el as HTMLElement).style.display = 'none';
      });
    };
    
    hideNotifications();
    // Ejecutar también después de un delay por si se añaden después
    const timer = setTimeout(hideNotifications, 500);

    return () => {
      clearTimeout(timer);
      document.documentElement.style.background = '';
      document.documentElement.style.backgroundColor = '';
      document.body.style.background = '';
      document.body.style.backgroundColor = '';
      if (root) {
        root.style.background = '';
        root.style.backgroundColor = '';
      }
    };
  }, []);

  return (
    <>
      <style>{`
        html, body, #root {
          background: transparent !important;
          background-color: transparent !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        /* Ocultar toasters para overlays de broadcast */
        [role="region"][aria-label*="Notifications"],
        section[aria-label*="Notifications"],
        [data-sonner-toaster] {
          display: none !important;
          visibility: hidden !important;
        }
      `}</style>

      <div
        style={{
          position: 'fixed',
          inset: 0,
          width: '100vw',
          height: '100vh',
          overflow: 'hidden',
          background: 'transparent',
          backgroundColor: 'transparent',
          pointerEvents: 'none',
        }}
      >
        {children}
      </div>
    </>
  );
};

export default DataDisplay;
