import { useState } from "react";
import bg from "@/assets/lobby_winter.jpg";
import { sfx } from "./audio";
import { BTN, useGamepadButtons, usePadConnected } from "./gamepad";
import { useMeta, type Device } from "./store";
import { GamepadIcon, Scaled, useUiScale } from "./ui";

/** First-load platform picker. Mobile can only continue once a controller is connected. */
export function DeviceGate() {
  const setDevice = useMeta((s) => s.setDevice);
  const [step, setStep] = useState<"pick" | "pad">("pick");
  const [focus, setFocus] = useState<Device>("pc");
  const pad = usePadConnected();
  const scale = Math.min(useUiScale(), 1);

  const choose = (d: Device) => {
    sfx.click();
    if (d === "pc") { setDevice("pc"); return; }
    setStep("pad");
  };
  const finishMobile = () => {
    if (!pad) return;
    sfx.ready();
    const el = document.documentElement as HTMLElement & { requestFullscreen?: () => Promise<void> };
    el.requestFullscreen?.().then(() => (screen.orientation as unknown as { lock?: (o: string) => Promise<void> })?.lock?.("landscape")).catch(() => {});
    setDevice("mobile");
  };

  useGamepadButtons((b) => {
    if (step === "pick") {
      if (b === BTN.LEFT || b === BTN.RIGHT || b === BTN.LB || b === BTN.RB) { sfx.click(); setFocus((f) => (f === "pc" ? "mobile" : "pc")); }
      if (b === BTN.A) choose(focus);
    } else {
      if (b === BTN.A) finishMobile();
      if (b === BTN.B) { sfx.click(); setStep("pick"); }
    }
  });

  return (
    <div className="fixed inset-0 overflow-hidden bg-fn-navy font-body text-hud select-none">
      <img src={bg} alt="" width={1920} height={1088} className="absolute inset-0 h-full w-full scale-105 object-cover opacity-60 blur-[3px]" />
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 40%, color-mix(in oklab, var(--lobby-1) 55%, transparent), color-mix(in oklab, var(--fn-navy) 92%, transparent) 75%)" }} />
      <Scaled scale={scale}>
        <div className="flex h-full flex-col items-center justify-center gap-8 px-6">
          <div className="text-center">
            <div className="font-display text-7xl leading-none tracking-wide" style={{ transform: "skewX(-9deg)", textShadow: "0 5px 0 var(--fn-navy)" }}>
              PROJECT <span className="text-fn-yellow">REWIND</span>
            </div>
            <div className="mt-3 font-ui text-xl uppercase tracking-[0.3em] text-fn-text-dim">{step === "pick" ? "Select your platform" : "Controller required"}</div>
          </div>

          {step === "pick" ? (
            <div className="flex gap-8">
              <PlatformCard label="PC" sub="Keyboard & mouse" active={focus === "pc"} onHover={() => setFocus("pc")} onClick={() => choose("pc")}>
                <svg width="120" height="96" viewBox="0 0 120 96" fill="none" stroke="currentColor" strokeWidth="5" strokeLinejoin="round"><rect x="10" y="6" width="100" height="62" rx="4" /><path d="M48 68l-4 16h32l-4-16M34 88h52" /></svg>
              </PlatformCard>
              <PlatformCard label="MOBILE" sub="Controller required" active={focus === "mobile"} onHover={() => setFocus("mobile")} onClick={() => choose("mobile")}>
                <div className="flex items-end gap-3">
                  <svg width="46" height="84" viewBox="0 0 46 84" fill="none" stroke="currentColor" strokeWidth="5"><rect x="3" y="3" width="40" height="78" rx="7" /><path d="M17 70h12" /></svg>
                  <GamepadIcon size={84} />
                </div>
              </PlatformCard>
            </div>
          ) : (
            <div className="w-[560px] max-w-full border-2 border-fn-panel-head bg-fn-navy-2/90 p-8 text-center shadow-2xl">
              <GamepadIcon size={150} className={pad ? "mx-auto text-fn-party" : "mx-auto animate-pulse text-fn-text-dim"} />
              <div className={`mx-auto mt-5 inline-flex items-center gap-2 px-4 py-1.5 font-ui text-lg uppercase tracking-wide ${pad ? "bg-fn-party text-fn-navy" : "bg-fn-panel text-hud"}`}>
                <span className={`h-2.5 w-2.5 rounded-full ${pad ? "bg-fn-navy" : "animate-ping bg-fn-yellow"}`} />
                {pad ? "Controller connected" : "Waiting for controller…"}
              </div>
              {pad && <div className="mt-2 truncate font-body text-sm text-fn-text-dim">{pad}</div>}
              <p className="mt-4 font-body text-lg text-fn-text-dim">
                Mobile mode plays with a controller only. Pair a Bluetooth controller with your device, then press any button on it.
              </p>
              <div className="mt-6 flex justify-center gap-4">
                <button onClick={() => { sfx.click(); setStep("pick"); }} className="bg-fn-panel px-6 py-2.5 font-display text-2xl tracking-wide hover:brightness-110">BACK</button>
                <button onClick={finishMobile} disabled={!pad}
                  className="bg-fn-yellow px-8 py-2.5 font-display text-2xl tracking-wide text-fn-navy enabled:hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40">
                  CONTINUE {pad && <span className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-fn-navy text-base text-fn-party">A</span>}
                </button>
              </div>
            </div>
          )}
          <div className="font-ui text-sm uppercase tracking-wider text-fn-text-dim">You can change this later in Settings</div>
        </div>
      </Scaled>
    </div>
  );
}

function PlatformCard({ label, sub, active, onClick, onHover, children }: { label: string; sub: string; active: boolean; onClick: () => void; onHover: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} onMouseEnter={onHover}
      className={`group flex h-72 w-72 flex-col items-center justify-center gap-5 border-4 transition ${active ? "-translate-y-1 border-fn-yellow bg-fn-panel-head/90" : "border-fn-panel-head/60 bg-fn-navy-2/85"}`}
      style={{ boxShadow: active ? "0 0 40px -6px var(--fn-yellow)" : undefined }}>
      <div className={active ? "text-hud" : "text-fn-text-dim"}>{children}</div>
      <div className="font-display text-5xl tracking-wide">{label}</div>
      <div className="-mt-3 font-ui text-base uppercase tracking-wider text-fn-text-dim">{sub}</div>
    </button>
  );
}
