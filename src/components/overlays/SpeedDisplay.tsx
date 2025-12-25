// SpeedDisplay - Simple square speed display for vMix overlays
import { motion, useSpring, useTransform } from "framer-motion";
import { useEffect, useState } from "react";

interface SpeedDisplayProps {
  speed: number;
  size?: number;
  color?: string;
  bgColor?: string;
  bgOpacity?: number;
  fontFamily?: string;
  isManual?: boolean;
  showBadge?: boolean;
  displayType?: "speed" | "pace";
  rawValue?: string;
}

const SpeedDisplay = ({
  speed,
  size = 72,
  color = "#FFFFFF",
  bgColor = "#000000",
  bgOpacity = 0.7,
  fontFamily = '"Bebas Neue", cursive',
  isManual = false,
  showBadge = false,
  displayType = "speed",
  rawValue,
}: SpeedDisplayProps) => {
  const spring = useSpring(speed, {
    stiffness: 50,
    damping: 20,
    mass: 0.8,
  });

  const [displaySpeed, setDisplaySpeed] = useState(Math.round(speed));

  useEffect(() => {
    spring.set(speed);
  }, [speed, spring]);

  useEffect(() => {
    const unsubscribe = spring.on("change", (v) => {
      setDisplaySpeed(Math.round(v));
    });
    return unsubscribe;
  }, [spring]);

  // Parse background color and apply opacity
  const parsedBgColor = bgColor.startsWith('#') 
    ? hexToRgba(bgColor, bgOpacity)
    : bgColor.includes('rgba') 
      ? bgColor.replace(/[\d.]+\)$/, `${bgOpacity})`)
      : `rgba(0,0,0,${bgOpacity})`;

  return (
    <motion.div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: `${size * 0.15}px ${size * 0.3}px`,
        borderRadius: "8px",
        backgroundColor: parsedBgColor,
        boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
        position: "relative",
      }}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 200, damping: 25 }}
    >
      {/* Main speed value */}
      <motion.div
        style={{
          fontFamily,
          fontSize: `${size}px`,
          fontWeight: "bold",
          color,
          lineHeight: 1,
          textShadow: "2px 2px 4px rgba(0,0,0,0.5)",
          letterSpacing: "-1px",
        }}
        key={displayType === "pace" ? rawValue : displaySpeed}
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
      >
        {displayType === "pace" && rawValue ? rawValue : displaySpeed}
      </motion.div>
      
      {/* Unit label */}
      <div
        style={{
          fontFamily: '"Roboto Condensed", sans-serif',
          fontSize: `${size * 0.22}px`,
          color: "rgba(255,255,255,0.7)",
          marginTop: `-${size * 0.05}px`,
          letterSpacing: "1px",
          fontWeight: "bold",
        }}
      >
        {displayType === "pace" ? "min/km" : "km/h"}
      </div>

      {/* Manual mode badge */}
      {showBadge && isManual && (
        <div
          style={{
            position: "absolute",
            top: "-8px",
            right: "-8px",
            background: "rgba(255, 165, 0, 0.95)",
            color: "#000",
            fontSize: `${size * 0.12}px`,
            fontWeight: "bold",
            padding: "2px 6px",
            borderRadius: "4px",
            fontFamily: "system-ui, monospace",
            letterSpacing: "0.5px",
          }}
        >
          MANUAL
        </div>
      )}
    </motion.div>
  );
};

// Helper function to convert hex to rgba
function hexToRgba(hex: string, alpha: number): string {
  if (!hex || !hex.startsWith('#')) return `rgba(0, 0, 0, ${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default SpeedDisplay;
