import { useCallback, useRef } from "react";

// Gera um beep de notificação via Web Audio API
function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

    // Primeiro tom
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.frequency.setValueAtTime(830, ctx.currentTime);
    osc1.type = "sine";
    gain1.gain.setValueAtTime(0.15, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.15);

    // Segundo tom (mais agudo, com leve delay)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.frequency.setValueAtTime(1100, ctx.currentTime + 0.12);
    osc2.type = "sine";
    gain2.gain.setValueAtTime(0, ctx.currentTime);
    gain2.gain.setValueAtTime(0.12, ctx.currentTime + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc2.start(ctx.currentTime + 0.12);
    osc2.stop(ctx.currentTime + 0.3);

    setTimeout(() => ctx.close(), 500);
  } catch {
    // Audio não suportado
  }
}

export function useNotificationSound() {
  const lastPlayed = useRef(0);

  const play = useCallback(() => {
    const now = Date.now();
    // Throttle para evitar sons muito rápidos
    if (now - lastPlayed.current > 1000) {
      lastPlayed.current = now;
      playNotificationSound();
    }
  }, []);

  return { play };
}
