import { useEffect, useState } from 'react';
import camberasLogo from '@/assets/camberas-logo.png';

interface GPSSplashScreenProps {
  onComplete: () => void;
  duration?: number;
}

export const GPSSplashScreen = ({ onComplete, duration = 2000 }: GPSSplashScreenProps) => {
  const [fadeOut, setFadeOut] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    // Safety fallback - always complete after duration regardless of image load
    const fadeTimer = setTimeout(() => setFadeOut(true), duration - 500);
    const completeTimer = setTimeout(onComplete, duration);
    
    // Additional safety: force complete after max 5 seconds even if something fails
    const safetyTimer = setTimeout(() => {
      console.log('GPSSplashScreen: Safety timeout triggered');
      onComplete();
    }, 5000);
    
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(completeTimer);
      clearTimeout(safetyTimer);
    };
  }, [duration, onComplete]);

  // Preload image
  useEffect(() => {
    const img = new Image();
    img.onload = () => setImageLoaded(true);
    img.onerror = () => {
      console.warn('GPSSplashScreen: Image failed to load');
      setImageLoaded(true); // Continue anyway
    };
    img.src = camberasLogo;
  }, []);

  return (
    <div 
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center transition-opacity duration-500 ${
        fadeOut ? 'opacity-0' : 'opacity-100'
      }`}
      style={{ 
        background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #16213e 100%)'
      }}
    >
      {/* Animated background circles */}
      <div className="absolute inset-0 overflow-hidden">
        <div 
          className="absolute w-96 h-96 rounded-full opacity-20 animate-pulse"
          style={{ 
            background: 'radial-gradient(circle, #E91E8C 0%, transparent 70%)',
            top: '20%',
            left: '50%',
            transform: 'translateX(-50%)',
          }}
        />
        <div 
          className="absolute w-64 h-64 rounded-full opacity-10 animate-pulse"
          style={{ 
            background: 'radial-gradient(circle, #E91E8C 0%, transparent 70%)',
            bottom: '30%',
            right: '10%',
            animationDelay: '0.5s',
          }}
        />
      </div>

      {/* Logo */}
      <div className="relative z-10 animate-fade-in">
        <div 
          className="w-32 h-32 rounded-full flex items-center justify-center mb-6 animate-scale-in"
          style={{ 
            boxShadow: '0 0 60px rgba(233, 30, 140, 0.4)',
          }}
        >
          <img 
            src={camberasLogo} 
            alt="Camberas" 
            className="w-28 h-28 object-contain"
          />
        </div>
      </div>

      {/* Text */}
      <div className="relative z-10 text-center animate-fade-in" style={{ animationDelay: '0.3s' }}>
        <h1 
          className="text-3xl font-bold mb-2"
          style={{ color: '#E91E8C' }}
        >
          Camberas GPS
        </h1>
        <p className="text-white/60 text-sm">Seguimiento en Vivo</p>
      </div>

      {/* Loading indicator */}
      <div className="absolute bottom-16 left-1/2 -translate-x-1/2 animate-fade-in" style={{ animationDelay: '0.6s' }}>
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ 
                backgroundColor: '#E91E8C',
                animationDelay: `${i * 0.2}s`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
