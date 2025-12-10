import { useCallback, useRef } from 'react';

interface CheckpointFeedbackOptions {
  enableVibration?: boolean;
  enableSound?: boolean;
  soundVolume?: number;
}

/**
 * Hook for providing haptic and audio feedback when passing checkpoints
 */
export const useCheckpointFeedback = (options: CheckpointFeedbackOptions = {}) => {
  const {
    enableVibration = true,
    enableSound = true,
    soundVolume = 0.7,
  } = options;

  const audioContextRef = useRef<AudioContext | null>(null);

  // Initialize AudioContext lazily (required for iOS)
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioContextRef.current;
  }, []);

  // Play a success tone using Web Audio API
  const playCheckpointSound = useCallback(() => {
    if (!enableSound) return;

    try {
      const ctx = getAudioContext();
      
      // Resume context if suspended (iOS requirement)
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const now = ctx.currentTime;

      // Create a pleasant "ding" sound
      const oscillator1 = ctx.createOscillator();
      const oscillator2 = ctx.createOscillator();
      const gainNode = ctx.createGain();

      // First tone (higher)
      oscillator1.type = 'sine';
      oscillator1.frequency.setValueAtTime(880, now); // A5
      oscillator1.frequency.exponentialRampToValueAtTime(1320, now + 0.1); // E6

      // Second tone (harmony)
      oscillator2.type = 'sine';
      oscillator2.frequency.setValueAtTime(1100, now); // C#6
      oscillator2.frequency.exponentialRampToValueAtTime(1760, now + 0.1); // A6

      // Volume envelope
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(soundVolume * 0.5, now + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

      // Connect nodes
      oscillator1.connect(gainNode);
      oscillator2.connect(gainNode);
      gainNode.connect(ctx.destination);

      // Play
      oscillator1.start(now);
      oscillator2.start(now);
      oscillator1.stop(now + 0.4);
      oscillator2.stop(now + 0.4);

    } catch (e) {
      console.error('Error playing checkpoint sound:', e);
    }
  }, [enableSound, soundVolume, getAudioContext]);

  // Vibrate with a distinctive pattern
  const vibrateCheckpoint = useCallback(() => {
    if (!enableVibration || !('vibrate' in navigator)) return;

    try {
      // Pattern: short-pause-short-pause-long (success pattern)
      navigator.vibrate([100, 50, 100, 50, 200]);
    } catch (e) {
      console.error('Error vibrating:', e);
    }
  }, [enableVibration]);

  // Combined feedback for checkpoint
  const triggerCheckpointFeedback = useCallback(() => {
    vibrateCheckpoint();
    playCheckpointSound();
  }, [vibrateCheckpoint, playCheckpointSound]);

  // Play a subtle tick for GPS updates
  const playGpsTick = useCallback(() => {
    if (!enableSound) return;

    try {
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') return;

      const now = ctx.currentTime;
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(1200, now);

      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(soundVolume * 0.1, now + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.05);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.start(now);
      oscillator.stop(now + 0.05);
    } catch (e) {
      // Silent fail for tick sound
    }
  }, [enableSound, soundVolume, getAudioContext]);

  // Light vibration for GPS tick
  const vibrateGpsTick = useCallback(() => {
    if (!enableVibration || !('vibrate' in navigator)) return;
    try {
      navigator.vibrate(30);
    } catch (e) {
      // Silent fail
    }
  }, [enableVibration]);

  return {
    triggerCheckpointFeedback,
    playCheckpointSound,
    vibrateCheckpoint,
    playGpsTick,
    vibrateGpsTick,
  };
};
