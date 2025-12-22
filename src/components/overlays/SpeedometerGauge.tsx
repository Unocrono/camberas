// SpeedometerGauge - Circular car-style speedometer
import { motion, useSpring, useTransform } from "framer-motion";
import { useEffect, useState } from "react";

interface SpeedometerGaugeProps {
  speed: number;
  maxSpeed?: number;
  size?: number;
  color?: string;
  bgColor?: string;
  isManual?: boolean;
}

const SpeedometerGauge = ({
  speed,
  maxSpeed = 60,
  size = 200,
  color = "#FFFFFF",
  bgColor = "rgba(0,0,0,0.7)",
  isManual = false,
}: SpeedometerGaugeProps) => {
  const spring = useSpring(speed, {
    stiffness: 80,
    damping: 20,
    mass: 0.5,
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

  // Angle calculation: -135° to +135° (270° arc)
  const startAngle = -135;
  const endAngle = 135;
  const totalAngle = endAngle - startAngle; // 270°

  const rotation = useTransform(
    spring,
    [0, maxSpeed],
    [startAngle, endAngle]
  );

  // Generate tick marks - major every 10 km/h, minor every 5
  const ticks = [];
  const majorInterval = 10;
  const minorInterval = 5;

  for (let i = 0; i <= maxSpeed; i += minorInterval) {
    const isMajor = i % majorInterval === 0;
    const angle = startAngle + (i / maxSpeed) * totalAngle;
    const angleRad = (angle * Math.PI) / 180;
    
    const outerRadius = size * 0.42;
    const innerRadius = isMajor ? size * 0.32 : size * 0.36;
    const textRadius = size * 0.26;

    const x1 = size / 2 + Math.cos(angleRad) * outerRadius;
    const y1 = size / 2 + Math.sin(angleRad) * outerRadius;
    const x2 = size / 2 + Math.cos(angleRad) * innerRadius;
    const y2 = size / 2 + Math.sin(angleRad) * innerRadius;
    const textX = size / 2 + Math.cos(angleRad) * textRadius;
    const textY = size / 2 + Math.sin(angleRad) * textRadius;

    ticks.push(
      <g key={`tick-${i}`}>
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={color}
          strokeWidth={isMajor ? 3 : 1.5}
          strokeLinecap="round"
          opacity={isMajor ? 1 : 0.6}
        />
        {isMajor && (
          <text
            x={textX}
            y={textY}
            fill={color}
            fontSize={size * 0.08}
            fontFamily="'Bebas Neue', sans-serif"
            textAnchor="middle"
            dominantBaseline="middle"
            opacity={0.9}
          >
            {i}
          </text>
        )}
      </g>
    );
  }

  // Arc path for background
  const arcRadius = size * 0.39;
  const arcPath = describeArc(size / 2, size / 2, arcRadius, startAngle, endAngle);

  // Progress arc based on current speed
  const progressAngle = startAngle + (Math.min(speed, maxSpeed) / maxSpeed) * totalAngle;
  const progressArcPath = describeArc(size / 2, size / 2, arcRadius, startAngle, progressAngle);

  return (
    <div
      style={{
        width: size,
        height: size,
        position: "relative",
        background: bgColor,
        borderRadius: "50%",
        boxShadow: "0 4px 20px rgba(0,0,0,0.5), inset 0 0 40px rgba(0,0,0,0.3)",
      }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background arc */}
        <path
          d={arcPath}
          fill="none"
          stroke="rgba(255,255,255,0.15)"
          strokeWidth={size * 0.04}
          strokeLinecap="round"
        />

        {/* Progress arc with gradient */}
        <defs>
          <linearGradient id="speedGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#00FF00" />
            <stop offset="50%" stopColor="#FFFF00" />
            <stop offset="100%" stopColor="#FF4500" />
          </linearGradient>
        </defs>
        <motion.path
          d={progressArcPath}
          fill="none"
          stroke="url(#speedGradient)"
          strokeWidth={size * 0.04}
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: speed / maxSpeed }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />

        {/* Tick marks */}
        {ticks}

        {/* Needle */}
        <motion.g
          style={{
            originX: `${size / 2}px`,
            originY: `${size / 2}px`,
            rotate: rotation,
          }}
        >
          {/* Needle shadow */}
          <polygon
            points={`
              ${size / 2},${size * 0.15}
              ${size / 2 - size * 0.02},${size / 2}
              ${size / 2 + size * 0.02},${size / 2}
            `}
            fill="rgba(0,0,0,0.3)"
            transform={`translate(2, 2)`}
          />
          {/* Main needle */}
          <polygon
            points={`
              ${size / 2},${size * 0.15}
              ${size / 2 - size * 0.015},${size / 2}
              ${size / 2 + size * 0.015},${size / 2}
            `}
            fill="#FF4500"
          />
          {/* Needle highlight */}
          <polygon
            points={`
              ${size / 2},${size * 0.16}
              ${size / 2 - size * 0.008},${size / 2 - size * 0.05}
              ${size / 2 + size * 0.008},${size / 2 - size * 0.05}
            `}
            fill="#FF6B3D"
          />
        </motion.g>

        {/* Center cap */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={size * 0.08}
          fill="#333"
          stroke="#555"
          strokeWidth={2}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={size * 0.05}
          fill="#222"
        />
      </svg>

      {/* Digital speed display */}
      <div
        style={{
          position: "absolute",
          bottom: size * 0.2,
          left: "50%",
          transform: "translateX(-50%)",
          textAlign: "center",
        }}
      >
        <motion.div
          style={{
            fontFamily: "'Bebas Neue', 'Arial Black', sans-serif",
            fontSize: size * 0.22,
            fontWeight: "bold",
            color: color,
            lineHeight: 1,
            textShadow: "2px 2px 4px rgba(0,0,0,0.8)",
          }}
          animate={{
            scale: [1, 1.02, 1],
          }}
          transition={{
            duration: 0.3,
            ease: "easeOut",
          }}
          key={displaySpeed}
        >
          {displaySpeed}
        </motion.div>
        <div
          style={{
            fontFamily: "'Roboto Condensed', sans-serif",
            fontSize: size * 0.08,
            color: "rgba(255,255,255,0.7)",
            marginTop: size * 0.01,
            letterSpacing: "1px",
          }}
        >
          km/h
        </div>
      </div>

      {/* Manual mode indicator */}
      {isManual && (
        <div
          style={{
            position: "absolute",
            top: size * 0.15,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(255, 165, 0, 0.9)",
            color: "#000",
            fontSize: size * 0.05,
            fontWeight: "bold",
            padding: `${size * 0.01}px ${size * 0.03}px`,
            borderRadius: size * 0.02,
            fontFamily: "monospace",
          }}
        >
          MANUAL
        </div>
      )}
    </div>
  );
};

// Helper function to create arc path
function describeArc(x: number, y: number, radius: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(x, y, radius, endAngle);
  const end = polarToCartesian(x, y, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

  return [
    "M", start.x, start.y,
    "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y
  ].join(" ");
}

function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
  const angleInRadians = (angleInDegrees * Math.PI) / 180.0;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

export default SpeedometerGauge;
