import { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';

/* ---------- hash router ---------- */
export const go = (path: string) => { location.hash = path; };
export function useRoute() {
  const get = () => location.hash.replace(/^#/, '') || '/';
  const [r, setR] = useState(get());
  useEffect(() => {
    const h = () => setR(get());
    addEventListener('hashchange', h);
    return () => removeEventListener('hashchange', h);
  }, []);
  return r;
}

export function useNow(ms = 1000) {
  const [n, setN] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setN(Date.now()), ms); return () => clearInterval(i); }, [ms]);
  return n;
}

/* ---------- toast & confirm host ---------- */
type Dlg = { msg: string; ok: string; danger: boolean; res: (v: boolean) => void } | null;
let setDlg: (d: Dlg) => void = () => {};
let setToast: (t: string) => void = () => {};

export const toast = (m: string) => setToast(m);
export const ask = (msg: string, ok = 'Confirm', danger = false) =>
  new Promise<boolean>((res) => setDlg({ msg, ok, danger, res }));

export function Overlays() {
  const [dlg, d] = useState<Dlg>(null);
  const [t, st] = useState('');
  setDlg = d;
  setToast = (m) => { st(m); setTimeout(() => st(''), 2200); };
  const close = (v: boolean) => { dlg?.res(v); d(null); };
  return (
    <>
      {t && <div class="toast" role="status">{t}</div>}
      {dlg && (
        <div class="scrim center" onClick={() => close(false)}>
          <div class="dialog" onClick={(e) => e.stopPropagation()} role="alertdialog">
            <p>{dlg.msg}</p>
            <div class="row gap">
              <button class="btn ghost grow" onClick={() => close(false)}>Cancel</button>
              <button class={'btn grow ' + (dlg.danger ? 'danger' : 'primary')} onClick={() => close(true)}>{dlg.ok}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- bottom sheet ---------- */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ComponentChildren }) {
  return (
    <div class="scrim" onClick={onClose}>
      <div class="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div class="sheet-head">
          <h2>{title}</h2>
          <button class="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div class="sheet-body">{children}</div>
      </div>
    </div>
  );
}

/* ---------- stepper ---------- */
export function Stepper({ label, value, step, min = 0, max = 100000, format, onChange, unit, decimals = 2 }: {
  label: string; value: number; step: number; min?: number; max?: number;
  format?: (n: number) => string; onChange: (n: number) => void; unit?: string; decimals?: number;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n * 10 ** decimals) / 10 ** decimals));
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? (format ? format(value) : String(value));
  const commit = () => {
    if (text !== null && !format) {
      const n = parseFloat(text.replace(',', '.'));
      if (!isNaN(n)) onChange(clamp(n));
    }
    setText(null);
  };
  return (
    <div class="stepper">
      <span class="stepper-label">{label}</span>
      <div class="stepper-row">
        <button class="step-btn" aria-label={`${label} minus`} onClick={() => onChange(clamp(value - step))}>−</button>
        <label class="step-val">
          <input
            inputMode={format ? 'none' : 'decimal'}
            readOnly={!!format}
            value={shown}
            onFocus={(e) => !format && (e.currentTarget as HTMLInputElement).select()}
            onInput={(e) => setText((e.currentTarget as HTMLInputElement).value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
          />
          {unit && <small>{unit}</small>}
        </label>
        <button class="step-btn" aria-label={`${label} plus`} onClick={() => onChange(clamp(value + step))}>+</button>
      </div>
    </div>
  );
}

export function Chips<T extends string | number>({ options, value, onChange, render, scroll }: {
  options: T[]; value: T | null; onChange: (v: T) => void; render?: (v: T) => string; scroll?: boolean;
}) {
  return (
    <div class={'chips' + (scroll ? ' scroll' : '')}>
      {options.map((o) => (
        <button key={String(o)} class={'chip' + (o === value ? ' on' : '')} onClick={() => onChange(o)}>{render ? render(o) : String(o)}</button>
      ))}
    </div>
  );
}

export function Header({ title, back, right }: { title: string; back?: string; right?: ComponentChildren }) {
  return (
    <header class="topbar">
      {back ? <button class="icon-btn" onClick={() => (back === 'back' ? history.back() : go(back))} aria-label="Back">←</button> : <span class="icon-spacer" />}
      <h1>{title}</h1>
      <div class="topbar-right">{right}</div>
    </header>
  );
}
