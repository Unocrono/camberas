// src/overlays/components/ModeBadge.tsx

/**
 * CAMBERAS OVERLAY SYSTEM - MODE BADGE COMPONENT
 * Badge animado que indica si el dato está en modo AUTO o MANUAL
 */

import { motion, AnimatePresence } from 'framer-motion';
import { Hand, Radio } from 'lucide-react';

interface ModeBadgeProps {
  isManual: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const sizeConfig = {
  sm: {
    fontSize: '8px',
    iconSize: 8,
    padding: '2px 4px',
  },
  md: {
    fontSize: '10px',
    iconSize: 10,
    padding: '2px 6px',
  },
  lg: {
    fontSize: '12px',
    iconSize: 12,
    padding: '3px 8px',
  },
};

/**
 * Badge que muestra el estado AUTO/MANUAL con animaciones
 * 
 * @example
 * ```tsx
 * <ModeBadge isManual={true} size="md" />
 * ```
 */
export const ModeBadge = ({ isManual, size = 'md' }: ModeBadgeProps) => {
  const config = sizeConfig[size];

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={isManual ? 'manual' : 'auto'}
        initial={{ scale: 0, opacity: 0, rotate: -10 }}
        animate={{
          scale: 1,
          opacity: 1,
          rotate: 0,
        }}
        exit={{ scale: 0, opacity: 0, rotate: 10 }}
        transition={{
          type: 'spring',
          stiffness: 400,
          damping: 20,
        }}
        style={{
          position: 'absolute',
          top: '-8px',
          right: '-8px',
          display: 'flex',
          alignItems: 'center',
          gap: '3px',
          padding: config.padding,
          borderRadius: '4px',
          fontSize: config.fontSize,
          fontWeight: 'bold',
          fontFamily: 'system-ui, sans-serif',
          letterSpacing: '0.5px',
          backgroundColor: isManual ? '#FF9800' : '#4CAF50',
          color: '#FFFFFF',
          boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
          zIndex: 10,
          pointerEvents: 'none',
        }}
      >
        {isManual ? (
          <>
            <motion.div
              animate={{
                rotate: [0, -15, 15, -15, 0],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            >
              <Hand size={config.iconSize} strokeWidth={2.5} />
            </motion.div>
            <span>MAN</span>
          </>
        ) : (
          <>
            <motion.div
              animate={{
                scale: [1, 1.2, 1],
                opacity: [1, 0.7, 1],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            >
              <Radio size={config.iconSize} strokeWidth={2.5} />
            </motion.div>
            <span>AUTO</span>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

/**
 * Wrapper que añade el badge a cualquier elemento
 */
export const WithModeBadge = ({
  children,
  isManual,
  showBadge = true,
  badgeSize = 'md',
}: {
  children: React.ReactNode;
  isManual: boolean;
  showBadge?: boolean;
  badgeSize?: 'sm' | 'md' | 'lg';
}) => {
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {children}
      {showBadge && <ModeBadge isManual={isManual} size={badgeSize} />}
    </div>
  );
};

export default ModeBadge;
