import { useEffect, useState } from 'preact/hooks';
import { getSettings } from './db';

const KEY = 'rest-end';
let endAt = 0;
let total = 0;
let timeout: number | undefined;
const listeners = new Set<() => void>();
let audio: AudioContext | null = null;

try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (saved && saved.endAt > Date.now()) { endAt = saved.endAt; total = saved.total; }
} catch {}

const emit = () => listeners.forEach((l) => l());

/** Must be called from a user gesture once so sound can play later. */
export function unlockAudio() {
  try {
    audio ??= new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  } catch {}
}

function beep() {
  if (!audio) return;
  const t0 = audio.currentTime;
  [0, 0.28, 0.56].forEach((d, i) => {
    const o = audio!.createOscillator(), g = audio!.createGain();
    o.frequency.value = i === 2 ? 1040 : 780;
    g.gain.setValueAtTime(0.0001, t0 + d);
    g.gain.exponentialRampToValueAtTime(0.4, t0 + d + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.22);
    o.connect(g).connect(audio!.destination);
    o.start(t0 + d);
    o.stop(t0 + d + 0.25);
  });
}

async function fire() {
  const s = await getSettings();
  if (s.sound) beep();
  if (s.vibrate) navigator.vibrate?.([300, 120, 300, 120, 500]);
  if (s.notify && document.visibilityState === 'hidden' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      const opts = { body: 'Rest is over. Next set.', tag: 'rest', icon: '/icon-192.png', vibrate: [300, 120, 300] } as NotificationOptions;
      if (reg) reg.showNotification('Rest done', opts); else new Notification('Rest done', opts);
    } catch {}
  }
}

function schedule() {
  clearTimeout(timeout);
  if (!endAt) return;
  const ms = endAt - Date.now();
  if (ms <= 0) { complete(); return; }
  timeout = window.setTimeout(complete, ms);
}

function complete() {
  if (!endAt) return;
  endAt = 0;
  try { localStorage.removeItem(KEY); } catch {}
  fire();
  emit();
}

export function startRest(sec: number) {
  if (sec <= 0) return;
  total = sec;
  endAt = Date.now() + sec * 1000;
  try { localStorage.setItem(KEY, JSON.stringify({ endAt, total })); } catch {}
  schedule();
  emit();
}

export function adjustRest(deltaSec: number) {
  if (!endAt) return;
  endAt += deltaSec * 1000;
  total += deltaSec;
  if (endAt <= Date.now()) { complete(); return; }
  try { localStorage.setItem(KEY, JSON.stringify({ endAt, total })); } catch {}
  schedule();
  emit();
}

export function stopRest() {
  endAt = 0;
  clearTimeout(timeout);
  try { localStorage.removeItem(KEY); } catch {}
  emit();
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { schedule(); emit(); }
});
schedule();

/** Remaining seconds (0 when idle) and total, ticking every 250ms while active. */
export function useRest() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    const iv = window.setInterval(() => { if (endAt) l(); }, 250);
    return () => { listeners.delete(l); clearInterval(iv); };
  }, []);
  return { remaining: endAt ? Math.max(0, Math.ceil((endAt - Date.now()) / 1000)) : 0, total, active: endAt > 0 };
}

let lock: any = null;
export async function keepAwake(on: boolean) {
  try {
    if (on && !lock) {
      lock = await (navigator as any).wakeLock?.request('screen');
      lock?.addEventListener?.('release', () => { lock = null; });
    } else if (!on && lock) {
      await lock.release();
      lock = null;
    }
  } catch {}
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && document.body.dataset.awake === '1' && !lock) keepAwake(true);
});
