import { useEffect, useState } from 'preact/hooks';
import { getSettings } from './db';
import { buildCues, buildPhases, Cue, Phase, RunSpec, Tone, totalSec } from './plan';
import { localDate } from './calc';
import { keepAwake } from './timer';

/**
 * Interval runner. Time is absolute (start timestamp minus paused time), so it survives reloads and a
 * frozen page. Beeps are scheduled ahead on the Web Audio clock (they keep firing with the screen locked as
 * long as the page counts as "playing media", which the silent looping <audio> + MediaSession ensures).
 * Voice and vibration run from a JS tick and are best-effort when the phone is locked.
 */

const KEY = 'run-state';
interface Saved { spec: RunSpec; startedAt: number; pausedAt: number; pausedMs: number; stopSec: number | null; date: string }

let saved: Saved | null = null;
let phases: Phase[] = [];
let cues: Cue[] = [];
let total = 0;
let lastSec = 0;
let tick: number | undefined;
const listeners = new Set<() => void>();
let cfg = { sound: true, vibrate: true, voice: true };

try {
  const s = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (s?.spec) { saved = s; rebuild(); }
} catch {}

function rebuild() {
  if (!saved) { phases = []; cues = []; total = 0; return; }
  phases = buildPhases(saved.spec);
  cues = buildCues(phases);
  total = totalSec(phases);
}
const persist = () => { try { saved ? localStorage.setItem(KEY, JSON.stringify(saved)) : localStorage.removeItem(KEY); } catch {} };
const emit = () => listeners.forEach((l) => l());

const elapsedSec = (now = Date.now()) =>
  !saved ? 0 : saved.stopSec !== null ? saved.stopSec : Math.max(0, ((saved.pausedAt || now) - saved.startedAt - saved.pausedMs) / 1000);

/* ---------- audio ---------- */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let keep: HTMLAudioElement | null = null;

function ensureCtx() {
  try {
    ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch {}
  return ctx;
}

/** Near-silent 1 s WAV (16-bit, amplitude ±2) looped so the browser keeps treating the page as media playback. */
function silentUrl() {
  const n = 8000, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, i % 40 < 20 ? 2 : -2, true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

function keepAlive(on: boolean) {
  try {
    if (on) {
      keep ??= Object.assign(new Audio(silentUrl()), { loop: true });
      keep.play().catch(() => {});
      const ms = (navigator as any).mediaSession;
      if (ms && 'MediaMetadata' in window) {
        ms.metadata = new (window as any).MediaMetadata({ title: 'Logbook run', artist: 'Interval timer', artwork: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }] });
        ms.setActionHandler('play', () => resumeRun());
        ms.setActionHandler('pause', () => pauseRun());
        ms.setActionHandler('nexttrack', () => skipPhase());
      }
    } else keep?.pause();
  } catch {}
}

const TONES: Record<Tone, [number, number, number][]> = {
  // [frequency Hz, start offset s, length s]
  hard: [[880, 0, 0.14], [1100, 0.2, 0.14], [1320, 0.4, 0.28]],
  run: [[784, 0, 0.18], [1175, 0.24, 0.3]],
  easy: [[660, 0, 0.22], [440, 0.3, 0.4]],
  walk: [[660, 0, 0.22], [440, 0.3, 0.4]],
  warmup: [[700, 0, 0.3]],
  cooldown: [[600, 0, 0.2], [500, 0.28, 0.2], [400, 0.56, 0.4]],
  tick: [[1000, 0, 0.09]],
  half: [[900, 0, 0.1], [900, 0.18, 0.1]],
  done: [[523, 0, 0.2], [659, 0.25, 0.2], [784, 0.5, 0.2], [1047, 0.75, 0.6]],
};

function scheduleBeeps(from: number) {
  if (master) { try { master.gain.value = 0; master.disconnect(); } catch {} master = null; }
  if (!cfg.sound || !ensureCtx() || !ctx) return;
  const c = ctx;
  master = c.createGain();
  master.gain.value = 0.9;
  master.connect(c.destination);
  const now = c.currentTime + 0.05;
  for (const cue of cues) {
    if (cue.at < from - 0.05) continue;
    for (const [f, off, len] of TONES[cue.tone]) {
      const t0 = now + (cue.at - from) + off;
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.6, t0 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
      o.connect(g).connect(master);
      o.start(t0);
      o.stop(t0 + len + 0.02);
    }
  }
}

function speak(text: string) {
  if (!cfg.voice || !('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-GB';
    u.rate = 1.05;
    speechSynthesis.speak(u);
  } catch {}
}

/* ---------- loop ---------- */
function onTick() {
  if (!saved || saved.stopSec !== null) return;
  const now = elapsedSec();
  if (!saved.pausedAt) {
    // Cues crossed since the last tick. After a long freeze only announce the most recent one.
    const crossed = cues.filter((c) => c.at > lastSec && c.at <= now);
    const speakable = crossed.filter((c) => c.say || c.vibrate);
    const use = now - lastSec > 3 ? speakable.slice(-1) : speakable;
    for (const c of use) {
      if (c.say) speak(c.say);
      if (c.vibrate && cfg.vibrate) navigator.vibrate?.(c.vibrate);
    }
  }
  lastSec = now;
  if (now >= total) { stopRun(); return; }
  emit();
}

function startLoop() {
  clearInterval(tick);
  tick = window.setInterval(onTick, 250);
}

/* ---------- controls ---------- */
export async function startRun(spec: RunSpec) {
  cfg = await getSettings();
  saved = { spec, startedAt: Date.now(), pausedAt: 0, pausedMs: 0, stopSec: null, date: localDate() };
  rebuild();
  lastSec = 0;
  persist();
  keepAlive(true);
  scheduleBeeps(0);
  startLoop();
  // The first cue (at 0) is spoken here so it does not wait for the first tick.
  const first = cues[0];
  if (first?.say) speak(first.say);
  if (first?.vibrate && cfg.vibrate) navigator.vibrate?.(first.vibrate);
  lastSec = 0.01;
  emit();
}

export function pauseRun() {
  if (!saved || saved.pausedAt || saved.stopSec !== null) return;
  saved.pausedAt = Date.now();
  persist();
  scheduleBeeps(1e9); // cancels pending beeps
  try { speechSynthesis.cancel(); } catch {}
  emit();
}

export async function resumeRun() {
  if (!saved || !saved.pausedAt) return;
  cfg = await getSettings();
  saved.pausedMs += Date.now() - saved.pausedAt;
  saved.pausedAt = 0;
  persist();
  keepAlive(true);
  lastSec = elapsedSec();
  scheduleBeeps(lastSec);
  startLoop();
  emit();
}

/** Jump to the start of the next phase. */
export function skipPhase() {
  if (!saved || saved.stopSec !== null) return;
  const now = elapsedSec();
  let end = 0;
  for (const p of phases) { end += p.sec; if (end > now) break; }
  if (end >= total) return;
  saved.startedAt -= (end - now) * 1000 + 50; // lands just inside the next phase
  persist();
  if (saved.pausedAt) { lastSec = elapsedSec(); emit(); return; } // paused: just move, resume will pick up from here
  lastSec = elapsedSec() - 0.2; // so the next phase's start cue fires from the tick
  scheduleBeeps(lastSec);
  onTick();
}

/** End the run (finished or stopped early). The state stays until it is saved or discarded. */
export function stopRun() {
  if (!saved || saved.stopSec !== null) return;
  const done = elapsedSec() >= total;
  saved.stopSec = Math.min(elapsedSec(), total);
  persist();
  clearInterval(tick);
  if (!done) scheduleBeeps(1e9); // a finished run lets the done jingle (already scheduled) play out
  setTimeout(() => { if (saved?.stopSec != null) keepAlive(false); }, done ? 4000 : 0);
  releaseScreen();
  emit();
}

function releaseScreen() {
  document.body.dataset.awake = '0';
  keepAwake(false);
}

/** Call from a tap while a run is going: re-arms audio after a reload or an unlock. */
export function rearm() {
  if (!saved || saved.stopSec !== null || saved.pausedAt) return;
  keepAlive(true);
  scheduleBeeps(elapsedSec());
}

export function clearRun() {
  saved = null;
  rebuild();
  persist();
  clearInterval(tick);
  scheduleBeeps(1e9);
  keepAlive(false);
  releaseScreen();
  try { speechSynthesis.cancel(); } catch {}
  emit();
}

/** Short sample of the cues, so you can check volume and voice before heading out. */
export async function testCues() {
  cfg = await getSettings();
  cues = [{ at: 0, tone: 'hard', phase: 0 }, { at: 1.6, tone: 'easy', phase: 0 }, { at: 3.2, tone: 'done', phase: 0 }];
  scheduleBeeps(0);
  speak('Hard. Rep one of six. One minute.');
  cues = []; // keep a later rebuild() as the source of truth
  rebuild();
}

/* ---------- state for the UI ---------- */
export interface RunView {
  active: boolean; paused: boolean; stopped: boolean; spec: RunSpec | null;
  elapsed: number; total: number; phaseIdx: number; phases: Phase[]; phaseLeft: number; phaseElapsed: number; date: string; needsTap: boolean;
}

export function runView(): RunView {
  const el = elapsedSec();
  let idx = 0, start = 0;
  for (let i = 0; i < phases.length; i++) {
    if (el < start + phases[i].sec || i === phases.length - 1) { idx = i; break; }
    start += phases[i].sec;
  }
  const p = phases[idx];
  return {
    active: !!saved, paused: !!saved?.pausedAt, stopped: saved?.stopSec != null, spec: saved?.spec ?? null,
    elapsed: el, total, phaseIdx: idx, phases, phaseLeft: p ? Math.max(0, Math.ceil(start + p.sec - el)) : 0,
    phaseElapsed: el - start, date: saved?.date ?? '', needsTap: cfg.sound && (!ctx || ctx.state !== 'running'),
  };
}

export function useRun(): RunView {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return runView();
}

/* ---------- resume after reload / unlock ---------- */
async function resumeLoop() {
  if (!saved || saved.stopSec !== null) return;
  cfg = await getSettings();
  if (elapsedSec() >= total) { stopRun(); return; }
  lastSec = elapsedSec();
  startLoop();
  if (!saved.pausedAt) { keepAlive(true); scheduleBeeps(lastSec); }
  emit();
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && saved && saved.stopSec === null && !saved.pausedAt) {
    // Re-schedule on the audio clock in case the context was suspended while hidden.
    lastSec = Math.max(lastSec, 0);
    scheduleBeeps(elapsedSec());
    emit();
  }
});
resumeLoop();
