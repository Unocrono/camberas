import { registerPlugin, Capacitor } from '@capacitor/core';

interface LockTaskPlugin {
  start(): Promise<void>;
  stop(): Promise<void>;
}

const LockTask = registerPlugin<LockTaskPlugin>('LockTask');

export const startLockTask = async (): Promise<void> => {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await LockTask.start();
  } catch (e) {
    console.error('LockTask.start error:', e);
  }
};

export const stopLockTask = async (): Promise<void> => {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await LockTask.stop();
  } catch (e) {
    console.error('LockTask.stop error:', e);
  }
};
