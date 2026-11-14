import { useEffect, useState, type ReactNode } from "react";
import { useMeta } from "./store";

/** HUD/menu scale: mobile shrinks to fit a phone, PC shrinks only in small windows. */
export function uiScaleFor(device: "pc" | "mobile" | null, w: number, h: number, lobby = false) {
  if (device === "mobile") return Math.max(0.42, Math.min(1, w / 1280, h / 740));
  if (lobby) return 1;
  return Math.max(0.6, Math.min(1, w / 1200, h / 720));
}

export function useUiScale(lobby = false) {
  const device = useMeta((s) => s.device);
  const [s, setS] = useState(1);
  useEffect(() => {
    const f = () => setS(uiScaleFor(device, window.innerWidth, window.innerHeight, lobby));
    f();
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, [device, lobby]);
  return s;
}

export function usePortrait() {
  const [p, setP] = useState(false);
  useEffect(() => {
    const f = () => setP(window.innerHeight > window.innerWidth);
    f();
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  return p;
}

/** Full-screen layer whose children are laid out at 1/scale size, then scaled down. */
export function Scaled({ scale, children, className = "" }: { scale: number; children: ReactNode; className?: string }) {
  return (
    <div className={`absolute left-0 top-0 origin-top-left ${className}`} style={{ width: `${100 / scale}%`, height: `${100 / scale}%`, transform: `scale(${scale})` }}>
      {children}
    </div>
  );
}

export function RotateHint() {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-fn-navy p-8 text-center text-hud">
      <svg width="90" height="90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="animate-pulse"><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M3 12a9 9 0 0 1 4-7.5M21 12a9 9 0 0 1-4 7.5" /></svg>
      <div className="font-display text-4xl tracking-wide">ROTATE YOUR DEVICE</div>
      <div className="font-ui text-lg text-fn-text-dim">Project Rewind plays in landscape on mobile.</div>
    </div>
  );
}

export function GamepadIcon({ size = 64, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size * 0.66} viewBox="0 0 96 64" className={className} fill="currentColor" aria-hidden>
      <path d="M22 6h52c10 0 16 8 19 20l3 17c2 11-8 19-16 12l-9-9H25l-9 9C8 62-2 54 0 43l3-17C6 14 12 6 22 6z" opacity=".9" />
      <g fill="var(--fn-navy)"><rect x="18" y="22" width="16" height="5" rx="1" /><rect x="23.5" y="16.5" width="5" height="16" rx="1" /><circle cx="70" cy="18" r="3.6" /><circle cx="78" cy="26" r="3.6" /><circle cx="62" cy="26" r="3.6" /><circle cx="70" cy="34" r="3.6" /><circle cx="38" cy="40" r="6" /><circle cx="58" cy="40" r="6" /></g>
    </svg>
  );
}
