// SpeedometerGauge - Circular clock-style speedometer for vMix overlays
import { motion, useSpring, useTransform } from "framer-motion";
import { useEffect, useState } from "react";

interface SpeedometerGaugeProps {
  speed: number;
  maxSpeed?: number;
  size?: number;
  color?: string;
  bgColor?: string;
  bgOpacity?: number;
  isManual?: boolean;
  showBadge?: boolean;
  displayType?: "speed" | "pace";
  rawValue?: string;
}

const SpeedometerGauge = ({
  speed,
  maxSpeed = 120,
  size = 200,
  color = "#FFFFFF",
  bgColor = "#000000",
  bgOpacity = 0.7,
  isManual = false,
  showBadge = false,
  displayType = "speed",
  rawValue,
}: SpeedometerGaugeProps) => {
  const spring = useSpring(speed, {
    stiffness: 60,
    damping: 15,
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

  // Full circle: 0° at top, clockwise like a clock
  // Speed 0 at -135°, max at +135° (270° arc)
  const startAngle = -135;
  const endAngle = 135;
  const totalAngle = endAngle - startAngle; // 270°

  const rotation = useTransform(
    spring,
    [0, maxSpeed],
    [startAngle, endAngle]
  );

  // Calculate center position
  const cx = size / 2;
  const cy = size / 2;
  const outerRadius = size * 0.45;
  const dotRadius = size * 0.42;
  const labelRadius = size * 0.32;
  const progressRadius = size * 0.38;

  // Generate dots around the circle (like clock markers)
  const dots = [];
  const totalDots = 60; // Like a clock with 60 second marks
  const majorInterval = 15; // Major marks at 0, 15, 30, 45 (quarters)
  const mediumInterval = 5; // Medium marks every 5

  for (let i = 0; i <= totalDots; i++) {
    // Map dots to our arc (not full 360)
    const dotAngle = startAngle + (i / totalDots) * totalAngle;
    const angleRad = (dotAngle * Math.PI) / 180;
    
    const isMajor = i % majorInterval === 0;
    const isMedium = i % mediumInterval === 0 && !isMajor;
    
    const dotSize = isMajor ? size * 0.025 : isMedium ? size * 0.015 : size * 0.008;
    const dotOpacity = isMajor ? 1 : isMedium ? 0.8 : 0.4;
    
    const x = cx + Math.cos(angleRad) * dotRadius;
    const y = cy + Math.sin(angleRad) * dotRadius;

    dots.push(
      <circle
        key={`dot-${i}`}
        cx={x}
        cy={y}
        r={dotSize}
        fill={isMajor ? color : isMedium ? color : "rgba(255,255,255,0.5)"}
        opacity={dotOpacity}
      />
    );
  }

  // Generate speed labels at quarters (0, 30, 60, 90, 120 for maxSpeed=120)
  const labels = [];
  const labelCount = 5;
  for (let i = 0; i < labelCount; i++) {
    const speedValue = Math.round((i / (labelCount - 1)) * maxSpeed);
    const labelAngle = startAngle + (i / (labelCount - 1)) * totalAngle;
    const angleRad = (labelAngle * Math.PI) / 180;
    
    const x = cx + Math.cos(angleRad) * labelRadius;
    const y = cy + Math.sin(angleRad) * labelRadius;

    labels.push(
      <text
        key={`label-${i}`}
        x={x}
        y={y}
        fill={color}
        fontSize={size * 0.08}
        fontFamily="'Bebas Neue', 'Arial Black', sans-serif"
        textAnchor="middle"
        dominantBaseline="middle"
        opacity={0.9}
        fontWeight="bold"
      >
        {speedValue}
      </text>
    );
  }

  // Progress arc - animated
  const progressAngle = useTransform(
    spring,
    [0, maxSpeed],
    [startAngle, endAngle]
  );

  // Create arc path helper
  const createArcPath = (startDeg: number, endDeg: number, radius: number) => {
    const startRad = (startDeg * Math.PI) / 180;
    const endRad = (endDeg * Math.PI) / 180;
    
    const x1 = cx + Math.cos(startRad) * radius;
    const y1 = cy + Math.sin(startRad) * radius;
    const x2 = cx + Math.cos(endRad) * radius;
    const y2 = cy + Math.sin(endRad) * radius;
    
    const largeArc = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
    const sweep = endDeg > startDeg ? 1 : 0;
    
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} ${sweep} ${x2} ${y2}`;
  };

  // Background arc path
  const bgArcPath = createArcPath(startAngle, endAngle, progressRadius);

  // Parse background color and apply opacity
  const parsedBgColor = bgColor.startsWith('#') 
    ? hexToRgba(bgColor, bgOpacity)
    : bgColor.includes('rgba') 
      ? bgColor.replace(/[\d.]+\)$/, `${bgOpacity})`)
      : `rgba(0,0,0,${bgOpacity})`;

  return (
    <div
      style={{
        width: size,
        height: size,
        position: "relative",
        borderRadius: "50%",
      }}
    >
      {/* Background circle with transparency */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: parsedBgColor,
          boxShadow: `0 4px 30px rgba(0,0,0,0.5), inset 0 0 60px rgba(0,0,0,0.3)`,
        }}
      />

      <svg 
        width={size} 
        height={size} 
        viewBox={`0 0 ${size} ${size}`}
        style={{ position: "relative", zIndex: 1 }}
      >
        {/* Outer glow ring */}
        <circle
          cx={cx}
          cy={cy}
          r={outerRadius}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={2}
        />

        {/* Background arc track */}
        <path
          d={bgArcPath}
          fill="none"
          stroke="rgba(255,255,255,0.15)"
          strokeWidth={size * 0.04}
          strokeLinecap="round"
        />

        {/* Progress arc with gradient */}
        <defs>
          <linearGradient id={`speedGradient-${size}`} x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#00FF88" />
            <stop offset="40%" stopColor="#FFFF00" />
            <stop offset="70%" stopColor="#FF8800" />
            <stop offset="100%" stopColor="#FF2200" />
          </linearGradient>
        </defs>
        
        <motion.circle
          cx={cx}
          cy={cy}
          r={progressRadius}
          fill="none"
          stroke={`url(#speedGradient-${size})`}
          strokeWidth={size * 0.045}
          strokeLinecap="round"
          strokeDasharray={2 * Math.PI * progressRadius}
          strokeDashoffset={useTransform(
            spring,
            [0, maxSpeed],
            [2 * Math.PI * progressRadius * (270 / 360), 2 * Math.PI * progressRadius * (270 / 360) * (1 - 1)]
          )}
          style={{
            rotate: startAngle - 90,
            transformOrigin: `${cx}px ${cy}px`,
          }}
          initial={{ strokeDashoffset: 2 * Math.PI * progressRadius * (270 / 360) }}
          animate={{ 
            strokeDashoffset: 2 * Math.PI * progressRadius * (270 / 360) * (1 - Math.min(speed / maxSpeed, 1))
          }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />

        {/* Clock-style dots */}
        {dots}

        {/* Speed labels at quarters */}
        {labels}

        {/* Needle */}
        <motion.g
          style={{
            originX: `${cx}px`,
            originY: `${cy}px`,
            rotate: rotation,
          }}
        >
          {/* Needle shadow */}
          <polygon
            points={`
              ${cx},${cy - size * 0.32}
              ${cx - size * 0.018},${cy}
              ${cx + size * 0.018},${cy}
            `}
            fill="rgba(0,0,0,0.4)"
            transform="translate(2, 2)"
          />
          {/* Main needle */}
          <polygon
            points={`
              ${cx},${cy - size * 0.32}
              ${cx - size * 0.012},${cy}
              ${cx + size * 0.012},${cy}
            `}
            fill="#FF3333"
          />
          {/* Needle highlight */}
          <polygon
            points={`
              ${cx},${cy - size * 0.30}
              ${cx - size * 0.006},${cy - size * 0.08}
              ${cx + size * 0.006},${cy - size * 0.08}
            `}
            fill="#FF6666"
          />
        </motion.g>

        {/* Center cap with glow */}
        <circle
          cx={cx}
          cy={cy}
          r={size * 0.07}
          fill="url(#centerGradient)"
        />
        <defs>
          <radialGradient id="centerGradient" cx="40%" cy="40%">
            <stop offset="0%" stopColor="#666" />
            <stop offset="100%" stopColor="#222" />
          </radialGradient>
        </defs>
        <circle
          cx={cx}
          cy={cy}
          r={size * 0.045}
          fill="#111"
          stroke="#333"
          strokeWidth={1}
        />
      </svg>

      {/* Digital speed display - large number in center bottom */}
      <div
        style={{
          position: "absolute",
          bottom: size * 0.15,
          left: "50%",
          transform: "translateX(-50%)",
          textAlign: "center",
        }}
      >
        <motion.div
          style={{
            fontFamily: "'Bebas Neue', 'Arial Black', sans-serif",
            fontSize: size * 0.28,
            fontWeight: "bold",
            color: color,
            lineHeight: 0.9,
            textShadow: "3px 3px 6px rgba(0,0,0,0.9)",
            letterSpacing: "-2px",
          }}
          animate={{
            scale: [1, 1.02, 1],
          }}
          transition={{
            duration: 0.3,
            ease: "easeOut",
          }}
          key={displayType === "pace" ? rawValue : displaySpeed}
        >
          {displayType === "pace" && rawValue ? rawValue : displaySpeed}
        </motion.div>
        <div
          style={{
            fontFamily: "'Roboto Condensed', 'Arial', sans-serif",
            fontSize: size * 0.07,
            color: "rgba(255,255,255,0.7)",
            marginTop: size * -0.01,
            letterSpacing: "2px",
            fontWeight: "bold",
          }}
        >
          {displayType === "pace" ? "min/km" : "km/h"}
        </div>
      </div>

      {/* Manual mode badge - only shown if showBadge is true */}
      {showBadge && isManual && (
        <div
          style={{
            position: "absolute",
            top: size * 0.12,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(255, 165, 0, 0.95)",
            color: "#000",
            fontSize: size * 0.045,
            fontWeight: "bold",
            padding: `${size * 0.01}px ${size * 0.03}px`,
            borderRadius: size * 0.02,
            fontFamily: "system-ui, monospace",
            letterSpacing: "1px",
          }}
        >
          MANUAL
        </div>
      )}
    </div>
  );
};

// Helper function to convert hex to rgba
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default SpeedometerGauge;
