// @ts-nocheck -- strict index checks relaxed for game UI
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import bg from "@/assets/lobby_winter.jpg";
import { CHALLENGES, PASS_TIERS, RARITY_COLORS, RARITY_NAMES, SKINS, XP_PER_TIER, makeNames, tierReward } from "./data";
import { preloadSamples, sfx } from "./audio";
import { lobbyMusic } from "./music";
import { currentDaily, levelOf, tierOf, useMeta, type Mode } from "./store";
import { Preview, SpeakerIcon, Stage, type StageMember } from "./LobbyStage";
import { BTN, useGamepadButtons, usePadConnected } from "./gamepad";
import { Scaled, useUiScale } from "./ui";

type Tab = "lobby" | "pass" | "locker" | "shop" | "profile" | "leaderboards" | "store";
const TABS: [Tab, string][] = [["lobby", "Lobby"], ["pass", "Battle Pass"], ["locker", "Locker"], ["shop", "Item Shop"], ["profile", "Profile"], ["leaderboards", "Leaderboards"], ["store", "Store"]];
const MODE_NAME: Record<Mode, string> = { 1: "SOLO", 2: "DUO", 4: "SQUAD" };
const MODES: Mode[] = [1, 2, 4];

interface Chat { id: number; time: string; kind: "party" | "chat" | "you"; who?: string; text: string }
const clock = () => new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export function Lobby({ onPlay }: { onPlay: () => void }) {
  const m = useMeta();
  const [tab, setTab] = useState<Tab>("lobby");
  const [mm, setMm] = useState<null | { t: number; found: number; start: number }>(null);
  const [toast, setToast] = useState("");
  const [chat, setChat] = useState<Chat[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [menu, setMenu] = useState(false);
  const [news, setNews] = useState(false);
  const chatId = useRef(0);
  const pad = usePadConnected();
  const mobile = m.device === "mobile";
  const uiScale = useUiScale(true);
  const skin = SKINS.find((s) => s.id === m.equipped) ?? SKINS[0];
  const total = m.mode === 4 ? 32 : 30;
  const vol = m.musicMuted ? 0 : m.musicVol;
  const volRef = useRef(vol);
  volRef.current = vol;

  const say = useCallback((text: string, kind: Chat["kind"] = "party", who?: string) => {
    setChat((c) => [...c.slice(-5), { id: chatId.current++, time: clock(), kind, text, who }]);
  }, []);

  const created = useRef(false);
  useEffect(() => { if (created.current) return; created.current = true; say(`${m.username} created the party.`); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // music
  useEffect(() => {
    let armed: (() => void) | null = null;
    lobbyMusic.play(volRef.current).then((ok) => {
      if (ok) return;
      armed = () => { lobbyMusic.play(volRef.current); };
      window.addEventListener("pointerdown", armed, { once: true });
      window.addEventListener("keydown", armed, { once: true });
    });
    return () => {
      if (armed) { window.removeEventListener("pointerdown", armed); window.removeEventListener("keydown", armed); }
      lobbyMusic.stop();
    };
  }, []);
  useEffect(() => { lobbyMusic.setVolume(vol); }, [vol]);

  // matchmaking
  useEffect(() => {
    if (!mm) return;
    if (mm.found >= total) {
      lobbyMusic.fadeOut(850);
      const t = setTimeout(() => onPlay(), 900);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setMm({ t: mm.t + 1, found: mm.t < 6 ? 1 : Math.min(total, mm.found + 1 + Math.floor(Math.random() * 5)), start: mm.start }), 260);
    return () => clearTimeout(t);
  }, [mm, total, onPlay]);

  const readyUp = () => { if (!mm && mobile && !pad) { sfx.empty(); flash("Connect a controller to play on mobile"); return; } if (mm) { sfx.click(); setMm(null); say(`${m.username} is no longer ready.`); return; } sfx.ready(); preloadSamples(); setMm({ t: 0, found: 1, start: performance.now() }); say(`${m.username} is ready.`); };
  const flash = (s: string) => { setToast(s); setTimeout(() => setToast(""), 1800); };
  const cycleMode = (dir: number) => { if (mm) return; sfx.click(); const i = MODES.indexOf(m.mode); m.setMode(MODES[(i + dir + MODES.length) % MODES.length]); };
  // Fill teammates are random players matched in the match itself, so nobody joins the lobby party.
  const invite = () => {
    if (mm) return;
    sfx.click();
    if (m.mode === 1) { m.setMode(2); m.setFill(true); flash("Duos · Fill — random teammate joins in the match"); }
    else if (!m.fill) { m.setFill(true); flash("Fill on — random teammates join in the match"); }
    else flash("Random teammates join when the match starts");
  };
  const send = () => {
    const txt = draft.trim();
    setDraft(""); setChatOpen(false);
    if (!txt) return;
    say(txt, "you", m.username);
  };
  const switchTab = (t: Tab) => { sfx.click(); setTab(t); setMenu(false); };

  // keyboard: Q/E = L1/R1, Enter chat, N news, I challenges, M mute
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.tagName === "INPUT";
      if (typing) { if (e.key === "Escape") { setChatOpen(false); (e.target as HTMLElement).blur(); } return; }
      const i = TABS.findIndex(([t]) => t === tab);
      if (e.key === "q" || e.key === "Q") switchTab(TABS[(i - 1 + TABS.length) % TABS.length][0]);
      else if (e.key === "e" || e.key === "E") switchTab(TABS[(i + 1) % TABS.length][0]);
      else if (e.key === "Enter" && tab === "lobby") { e.preventDefault(); setChatOpen(true); }
      else if (e.key === "n" || e.key === "N") setNews((v) => !v);
      else if (e.key === "i" || e.key === "I") switchTab("pass");
      else if (e.key === "m" || e.key === "M") m.setMusicMuted(!m.musicMuted);
      else if (e.key === "Escape") { setNews(false); setMenu(false); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  // controller: LB/RB = tabs (L1/R1), A = ready, D-pad = mode, Y = fill, B = back, Start = settings
  useGamepadButtons((b) => {
    const i = TABS.findIndex(([t]) => t === tab);
    if (b === BTN.LB) switchTab(TABS[(i - 1 + TABS.length) % TABS.length][0]);
    else if (b === BTN.RB) switchTab(TABS[(i + 1) % TABS.length][0]);
    else if (b === BTN.START) { sfx.click(); setMenu((v) => !v); }
    else if (b === BTN.B) { if (menu || news) { setMenu(false); setNews(false); } else if (tab !== "lobby") switchTab("lobby"); }
    else if (tab === "lobby") {
      if (b === BTN.A) readyUp();
      else if (b === BTN.LEFT) cycleMode(-1);
      else if (b === BTN.RIGHT) cycleMode(1);
      else if (b === BTN.Y && !mm && m.mode > 1) { sfx.click(); m.setFill(!m.fill); }
    }
  });

  const members: (StageMember | null)[] = [
    { name: m.username, skin, ready: !!mm, leader: true, you: true },
    null, null, null,
  ];

  return (
    <div className="fixed inset-0 overflow-hidden bg-fn-navy font-body text-hud select-none">
      <img src={bg} alt="" width={1920} height={1088} className="absolute inset-0 h-full w-full object-cover" />
      <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(180deg, color-mix(in oklab, var(--fn-navy) 45%, transparent) 0%, transparent 22%, transparent 75%, color-mix(in oklab, var(--fn-navy) 50%, transparent) 100%)" }} />

      {tab === "lobby" && <Stage members={members} onInvite={invite} canInvite={!mm} />}
      {tab !== "lobby" && <div className="absolute inset-0 bg-fn-navy/75 backdrop-blur-sm" />}

      <Scaled scale={uiScale} className="pointer-events-none [&>*]:pointer-events-auto">
      <TopBar rbucks={m.rbucks} party={1} muted={m.musicMuted} onMute={() => { sfx.click(); m.setMusicMuted(!m.musicMuted); }} onMenu={() => { sfx.click(); setMenu((v) => !v); }} />
      <TabBar tab={tab} onTab={switchTab} />
      {menu && <SettingsMenu onClose={() => setMenu(false)} />}

      {tab === "lobby" && (
        <>
          <LeftPanel />
          <PartyChat chat={chat} open={chatOpen} draft={draft} setDraft={setDraft} onSend={send} onOpen={() => setChatOpen(true)} />
          <ModeCard mode={m.mode} fill={m.fill} mm={mm} total={total} onCycle={cycleMode} onFill={(f) => { if (!mm) { sfx.click(); m.setFill(f); } }} onReady={readyUp} />
        </>
      )}
      {tab === "pass" && <PassTab />}
      {tab === "shop" && <ShopTab flash={flash} />}
      {tab === "locker" && <LockerTab />}
      {tab === "profile" && <ProfileTab />}
      {tab === "leaderboards" && <LeaderboardTab />}
      {tab === "store" && <StoreTab flash={flash} />}

      <Footer onChat={() => { setTab("lobby"); setChatOpen(true); }} onInspect={() => switchTab("pass")} onNews={() => { sfx.click(); setNews(true); }} party={1} />
      {news && <NewsModal onClose={() => setNews(false)} />}
      {toast && <div className="absolute bottom-20 left-1/2 z-40 -translate-x-1/2 bg-fn-navy/90 px-6 py-2 font-display text-2xl tracking-wide">{toast}</div>}
      {mobile && !pad && (
        <div className="absolute left-1/2 top-[120px] z-40 flex -translate-x-1/2 items-center gap-3 border-2 border-fn-yellow bg-fn-navy/95 px-5 py-2 font-ui text-lg uppercase tracking-wide">
          <span className="h-2.5 w-2.5 animate-ping rounded-full bg-fn-yellow" />Controller disconnected — connect one to ready up
        </div>
      )}
      </Scaled>
    </div>
  );
}

/* ---------------- chrome ---------------- */

function TopBar({ rbucks, party, muted, onMute, onMenu }: { rbucks: number; party: number; muted: boolean; onMute: () => void; onMenu: () => void }) {
  return (
    <header className="fn-topbar absolute inset-x-0 top-0 z-30 flex h-16 items-stretch">
      <div className="fn-stripes flex items-center bg-fn-navy-2 pl-[6%] pr-20" style={{ clipPath: "polygon(0 0, 100% 0, calc(100% - 44px) 100%, 0 100%)" }}>
        <Logo />
      </div>
      <div className="ml-auto flex items-center gap-2 pr-[5%]">
        <div className="fn-pill fn-shine flex h-11 min-w-36 items-center gap-2 px-3 font-display text-2xl tracking-wide"><RBuck size={26} />{rbucks.toLocaleString()}</div>
        <div className="fn-pill flex h-11 min-w-24 items-center gap-2 px-3 font-display text-2xl"><PartyIcon />{party}</div>
        <button onClick={onMute} aria-label={muted ? "Unmute music" : "Mute music"} className="fn-pill flex h-11 w-11 items-center justify-center transition hover:brightness-125">
          <MusicIcon muted={muted} />
        </button>
        <button onClick={onMenu} aria-label="Settings" className="flex h-11 w-12 flex-col items-center justify-center gap-1.5 hover:opacity-80">
          {[0, 1, 2].map((i) => <span key={i} className="block h-1.5 w-9 bg-fn-text-dim" />)}
        </button>
      </div>
    </header>
  );
}

function Logo() {
  return (
    <div className="fn-logo flex items-center gap-2 font-display text-[42px] leading-none tracking-wide text-hud" style={{ transform: "skewX(-9deg)" }}>
      <svg width="34" height="30" viewBox="0 0 34 30" aria-hidden><path d="M16 2 L2 15 L16 28 Z M32 2 L18 15 L32 28 Z" style={{ fill: "var(--fn-yellow)" }} /></svg>
      PROJECT <span className="text-fn-yellow">REWIND</span>
    </div>
  );
}

function TabBar({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  return (
    <nav className="absolute left-1/2 top-[78px] z-20 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap">
      <Bumper label="L1" hint="Q" />
      {TABS.map(([t, label]) => (
        <button key={t} onClick={() => onTab(t)}
          className={`fn-tab px-5 py-1 font-ui text-[22px] font-semibold uppercase tracking-wide transition duration-150 ${tab === t ? "fn-tab-on scale-105" : "fn-tab-off text-hud/90 hover:-translate-y-0.5 hover:text-hud hover:brightness-125"}`}>
          <span>{label}</span>
        </button>
      ))}
      <Bumper label="R1" hint="E" />
    </nav>
  );
}
function Bumper({ label, hint }: { label: string; hint: string }) {
  return (
    <span title={`Press ${hint}`} className="flex h-7 w-9 items-center justify-center rounded-t-lg rounded-b bg-fn-navy-2 font-ui text-xs font-bold text-fn-text-dim ring-1 ring-fn-panel-head">{label}</span>
  );
}

function Footer({ onChat, onInspect, onNews, party }: { onChat: () => void; onInspect: () => void; onNews: () => void; party: number }) {
  return (
    <footer className="absolute inset-x-0 bottom-0 z-30 flex h-12 items-center bg-fn-navy px-[5%] text-xl text-fn-text-dim">
      <button onClick={onChat} className="flex items-center gap-2 hover:text-hud"><KeyCap>↵</KeyCap>Hold to chat</button>
      <div className="mx-auto flex items-center gap-1 text-base"><PartyIcon small />{party} ›</div>
      <button onClick={onInspect} className="mr-8 flex items-center gap-2 hover:text-hud"><KeyCap round>I</KeyCap>Inspect Challenges</button>
      <button onClick={onNews} className="flex items-center gap-2 hover:text-hud"><KeyCap>N</KeyCap>News</button>
    </footer>
  );
}
function KeyCap({ children, round }: { children: React.ReactNode; round?: boolean }) {
  return <span className={`flex h-6 min-w-6 items-center justify-center bg-fn-panel-head px-1 font-ui text-sm font-bold text-hud ${round ? "rounded-full" : "rounded-sm"}`}>{children}</span>;
}

/* ---------------- lobby panels ---------------- */

function LeftPanel() {
  const m = useMeta();
  const lv = levelOf(m.xp);
  const tier = tierOf(m.xp);
  const stars = tier >= PASS_TIERS ? 10 : Math.floor((m.xp % XP_PER_TIER) / 100);
  const big = Math.ceil((lv.level + 1) / 5) * 5;
  const d = currentDaily(m.daily);
  const [featured, ...daily] = CHALLENGES;
  return (
    <aside className="fn-card fn-rise absolute left-[5%] top-[128px] z-10 w-[clamp(290px,26vw,470px)] text-fn-shadow">
      <div className="fn-head fn-stripes flex items-center justify-between px-4 py-1.5 font-display text-3xl tracking-wide text-hud/95">SEASON 1<span className="font-ui text-base font-semibold tracking-widest text-fn-yellow">WINTER</span></div>
      <div className="fn-panel-grad flex items-center gap-4 px-4 py-4">
        <Banner />
        <div className="flex-1">
          <div className="flex items-baseline gap-2 font-display leading-none"><span className="text-4xl text-hud/90">LEVEL</span><span className="text-6xl">{lv.level}</span></div>
          <div className="mt-2 font-ui text-xl text-hud/90">{lv.into.toLocaleString()} <span className="text-hud/60">/ {lv.need.toLocaleString()}</span></div>
          <div className="mt-1 flex items-center gap-2">
            <Bar v={lv.into / lv.need} />
            <span className="text-hud/80">▸</span><Star /><span className="font-ui text-xl">1</span>
          </div>
          <div className="mt-2 flex items-center justify-end gap-2 font-ui text-xl text-hud/85">LVL {big} <span>▸</span><Star /><span>10</span></div>
        </div>
      </div>
      <div className="fn-gold-card fn-shine flex items-center gap-3 px-3 py-2">
        <Medal />
        <div className="flex-1 leading-none">
          <div className="font-display text-3xl tracking-wide">BATTLE PASS</div>
          <div className="font-ui text-lg text-hud/85">Tier {tier}</div>
        </div>
        <div className="flex items-center gap-1 font-ui text-2xl"><Star /> {stars} <span className="text-hud/70">/ 10</span></div>
      </div>
      <ChallengeRow c={featured} v={d[featured.key]} done={d.done.includes(featured.id)} gold />
      <div className="fn-head px-4 py-1.5 font-ui text-xl font-semibold uppercase tracking-wide text-hud/90">Daily Challenges</div>
      {daily.map((c) => <ChallengeRow key={c.id} c={c} v={d[c.key]} done={d.done.includes(c.id)} />)}
    </aside>
  );
}
function ChallengeRow({ c, v, done, gold }: { c: (typeof CHALLENGES)[number]; v: number; done: boolean; gold?: boolean }) {
  const p = Math.min(c.target, v);
  return (
    <div className={`px-4 py-2 ${gold ? "bg-fn-gold-2/80" : "bg-fn-panel/85"} border-t border-fn-navy/40`}>
      <div className={`font-body text-xl ${done ? "line-through opacity-70" : ""}`}>{c.label}</div>
      <div className="flex items-center gap-2">
        <Bar v={p / c.target} gold={gold} />
        <span className="w-14 text-right font-ui text-lg">{p} / {c.target}</span>
        <XpBadge /><span className="font-ui text-lg">{c.xp}</span>
        <Star /><span className="font-ui text-lg">{c.stars}</span>
      </div>
    </div>
  );
}
function Bar({ v, gold }: { v: number; gold?: boolean }) {
  return <div className={`h-3 flex-1 ${gold ? "bg-fn-gold-1/60" : "bg-fn-navy/50"}`}><div className="fn-bar-fill h-full transition-[width] duration-700" style={{ width: `${Math.max(0, Math.min(1, v)) * 100}%` }} /></div>;
}

function PartyChat({ chat, open, draft, setDraft, onSend, onOpen }: { chat: Chat[]; open: boolean; draft: string; setDraft: (s: string) => void; onSend: () => void; onOpen: () => void }) {
  return (
    <div className="absolute bottom-[60px] left-[5%] z-10 w-[min(44vw,640px)] font-body text-[22px] leading-tight text-fn-shadow" onClick={() => !open && onOpen()}>
      {chat.map((c) => (
        <div key={c.id} className="animate-in fade-in slide-in-from-bottom-1">
          <span className="text-hud/80">[{c.time}] </span>
          {c.kind === "party" ? <span className="font-semibold text-fn-party">Party: {c.text}</span>
            : <span><span className="inline-flex translate-y-0.5"><SpeakerIcon on={false} /></span> <b className={c.kind === "you" ? "text-fn-yellow" : "text-fn-party"}>{c.who}:</b> {c.text}</span>}
        </div>
      ))}
      {open && (
        <form className="mt-1 flex items-center gap-2 bg-fn-navy/80 px-2 py-1" onSubmit={(e) => { e.preventDefault(); onSend(); }}>
          <span className="font-ui text-base uppercase text-fn-party">[Party]</span>
          <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value.slice(0, 80))} onBlur={() => !draft && onSend()} placeholder="Say something..." className="flex-1 bg-transparent text-hud outline-none placeholder:text-hud/40" />
        </form>
      )}
    </div>
  );
}

function ModeCard({ mode, fill, mm, total, onCycle, onFill, onReady }: { mode: Mode; fill: boolean; mm: null | { t: number; found: number; start: number }; total: number; onCycle: (d: number) => void; onFill: (f: boolean) => void; onReady: () => void }) {
  const secs = mm ? Math.floor((performance.now() - mm.start) / 1000) : 0;
  const status = !mm ? null : mm.found >= total ? "Joining match..." : mm.t < 6 ? "Connecting to matchmaking service..." : mode > 1 && fill && mm.t < 10 ? "Finding random teammates..." : `Players ${mm.found}/${total}`;
  return (
    <div className="fn-card fn-rise absolute bottom-[60px] right-[5%] z-10 w-[clamp(300px,22vw,420px)] text-fn-shadow">
      <div className="fn-head fn-stripes px-4 pb-2 pt-2 text-center">
        <div className="font-ui text-xl uppercase tracking-[0.2em] text-hud/80">Game Mode</div>
        <div className="flex items-center justify-between">
          <button onClick={() => onCycle(-1)} disabled={!!mm} aria-label="Previous mode" className="px-2 font-display text-4xl text-hud/70 transition hover:scale-125 hover:text-fn-yellow disabled:opacity-30">‹</button>
          <div key={mode} className="fn-rise font-display text-5xl leading-tight tracking-wide">{MODE_NAME[mode]}</div>
          <button onClick={() => onCycle(1)} disabled={!!mm} aria-label="Next mode" className="px-2 font-display text-4xl text-hud/70 transition hover:scale-125 hover:text-fn-yellow disabled:opacity-30">›</button>
        </div>
        <div className="mb-1 flex justify-center gap-1.5">
          {MODES.map((x) => <span key={x} className={`h-1.5 w-8 transition ${x === mode ? "bg-fn-yellow" : "bg-fn-navy/50"}`} />)}
        </div>
        {mode > 1 && (
          <div className="mt-1 grid grid-cols-2 gap-1">
            {[true, false].map((f) => (
              <button key={String(f)} disabled={!!mm} onClick={() => onFill(f)} className={`py-0.5 font-ui text-base font-semibold uppercase transition ${fill === f ? "bg-hud text-fn-navy" : "bg-fn-navy/40 hover:bg-fn-navy/60"}`}>{f ? "Fill" : "Don't Fill"}</button>
            ))}
          </div>
        )}
      </div>
      <div className="bg-fn-navy/85 px-4 py-2 text-center backdrop-blur-sm">
        {mm ? (
          <>
            <div className="flex items-center justify-center gap-2 font-ui text-2xl font-semibold text-fn-yellow">
              <span className="fn-spin inline-block h-5 w-5 rounded-full border-[3px] border-fn-yellow/30 border-t-fn-yellow" />
              Matchmaking <span className="font-display text-xl text-hud/80">{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}</span>
            </div>
            <div className="font-body text-lg italic text-hud/80">{status}</div>
            <div className="mt-1 h-1.5 bg-fn-navy-2"><div className="fn-bar-fill h-full transition-[width] duration-300" style={{ width: `${(Math.min(total, mm.found) / total) * 100}%` }} /></div>
          </>
        ) : (
          <>
            <div className="font-ui text-2xl font-semibold">Battle Royale</div>
            <div className="font-body text-lg italic text-hud/70">{total} players{mode > 1 ? (fill ? " · Fill (random teammates)" : " · Don't Fill") : ""}</div>
          </>
        )}
        <button onClick={onReady}
          className={`fn-shine mt-2 flex w-full items-center justify-center gap-3 py-3 font-display text-5xl tracking-wide text-fn-navy transition hover:brightness-110 active:translate-y-0.5 ${mm ? "fn-unready" : "fn-ready"}`}>
          <span className="flex h-8 w-8 items-center justify-center rounded-full border-4 border-fn-navy/80"><span className={`h-2.5 w-2.5 rounded-full bg-fn-navy/80 ${mm ? "" : "animate-ping"}`} /></span>
          {mm ? "UNREADY" : "READY UP"}
        </button>
      </div>
    </div>
  );
}

/* ---------------- menus ---------------- */

function SettingsMenu({ onClose }: { onClose: () => void }) {
  const m = useMeta();
  return (
    <div className="absolute right-[5%] top-16 z-40 w-80 border-2 border-fn-panel-head bg-fn-navy-2/95 p-4 shadow-2xl">
      <div className="flex items-center justify-between"><div className="font-display text-3xl tracking-wide">SETTINGS</div><button onClick={onClose} className="text-2xl opacity-70 hover:opacity-100" aria-label="Close settings">✕</button></div>
      <div className="mt-3 font-ui text-sm uppercase text-fn-text-dim">Music volume</div>
      <div className="mt-1 flex items-center gap-3">
        <button onClick={() => m.setMusicMuted(!m.musicMuted)} className="flex h-9 w-9 items-center justify-center bg-fn-panel" aria-label={m.musicMuted ? "Unmute music" : "Mute music"}><MusicIcon muted={m.musicMuted} /></button>
        <input type="range" min={0} max={100} value={Math.round(m.musicVol * 100)} onChange={(e) => { m.setMusicVol(Number(e.target.value) / 100); if (m.musicMuted) m.setMusicMuted(false); }} className="flex-1 accent-[var(--fn-yellow)]" aria-label="Music volume" />
        <span className="w-10 text-right font-ui">{m.musicMuted ? "0" : Math.round(m.musicVol * 100)}</span>
      </div>
      <div className="mt-4 font-ui text-sm uppercase text-fn-text-dim">Display name</div>
      <input value={m.username} onChange={(e) => m.setUsername(e.target.value)} className="mt-1 w-full bg-fn-navy px-2 py-1 font-ui text-xl outline-none ring-fn-yellow focus:ring-2" />
      <div className="mt-4 font-ui text-sm uppercase text-fn-text-dim">Platform</div>
      <div className="mt-1 flex items-center justify-between bg-fn-navy px-3 py-2">
        <span className="font-display text-2xl tracking-wide">{m.device === "mobile" ? "MOBILE + CONTROLLER" : "PC"}</span>
        <button onClick={() => m.setDevice(null)} className="bg-fn-yellow px-3 py-1 font-display text-lg tracking-wide text-fn-navy hover:brightness-105">CHANGE</button>
      </div>
      <div className="mt-4 text-sm text-fn-text-dim">Shortcuts: Q / E switch tabs · Enter chat · M mute · N news</div>
      <div className="mt-1 text-sm text-fn-text-dim">Controller: LB / RB tabs · A ready · D-pad mode · Y fill · Start settings</div>
    </div>
  );
}

function NewsModal({ onClose }: { onClose: () => void }) {
  const items = [
    ["Winter has arrived", "The lobby is snowed in for the holidays. Grab the Merry Mauler outfit in the Item Shop while it lasts."],
    ["Daily challenges", "Search chests, get eliminations and place top 10 to earn bonus XP and Battle Pass stars."],
    ["Squads are live", "Drop with up to three teammates. Choose Fill to get matched with players automatically."],
  ];
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-fn-navy/70" onClick={onClose}>
      <div className="w-[min(760px,90vw)] border-4 border-fn-panel-head bg-fn-navy-2" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between bg-fn-panel-head px-5 py-2"><div className="font-display text-4xl tracking-wide">NEWS</div><button onClick={onClose} className="font-display text-2xl" aria-label="Close news">✕</button></div>
        <div className="divide-y divide-fn-panel/60">
          {items.map(([t, b]) => (
            <div key={t} className="px-5 py-4"><div className="font-display text-2xl tracking-wide text-fn-yellow">{t.toUpperCase()}</div><div className="mt-1 text-xl text-fn-text-dim">{b}</div></div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- tabs ---------------- */

const Page = ({ children }: { children: React.ReactNode }) => <div className="absolute inset-x-0 bottom-12 top-[124px] z-10 overflow-y-auto px-[6%] py-6">{children}</div>;

function PassTab() {
  const m = useMeta();
  const tier = tierOf(m.xp);
  const d = currentDaily(m.daily);
  return (
    <Page>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><div className="font-display text-5xl tracking-wide">SEASON 1 BATTLE PASS</div><div className="text-xl text-fn-text-dim">Earn XP from eliminations, chests, survival time, placement and challenges. Tier {tier}/{PASS_TIERS}.</div></div>
      </div>
      <div className="mt-4 grid gap-1 md:grid-cols-3">
        {CHALLENGES.map((c) => <ChallengeRow key={c.id} c={c} v={d[c.key]} done={d.done.includes(c.id)} gold={c.featured} />)}
      </div>
      <div className="mt-6 grid grid-cols-5 gap-3 md:grid-cols-10">
        {Array.from({ length: PASS_TIERS }, (_, i) => i + 1).map((t) => {
          const r = tierReward(t);
          const got = tier >= t;
          const sk = r?.type === "skin" ? SKINS.find((s) => s.id === r.id) : null;
          return (
            <div key={t} className={`relative flex aspect-[3/4] flex-col items-center justify-center border-2 p-1 text-center ${got ? "border-fn-yellow" : "border-hud/20"}`}
              style={{ background: sk ? `linear-gradient(160deg, ${RARITY_COLORS[sk.rarity]}, color-mix(in oklab, ${RARITY_COLORS[sk.rarity]} 30%, black))` : "color-mix(in oklab, var(--fn-panel) 60%, transparent)" }}>
              <div className="absolute left-1 top-0.5 font-display text-sm">{t}</div>
              {r?.type === "rbucks" && <><RBuck size={26} /><div className="font-display">{r.amount}</div></>}
              {sk && <div className="font-display text-xs leading-tight">{sk.name}</div>}
              {!r && <div className="text-xs opacity-60">+ XP Boost</div>}
              {got && <div className="absolute bottom-0.5 right-1 text-fn-yellow">✔</div>}
            </div>
          );
        })}
      </div>
    </Page>
  );
}

function ShopTab({ flash }: { flash: (s: string) => void }) {
  const m = useMeta();
  return (
    <Page>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><div className="font-display text-5xl tracking-wide">ITEM SHOP</div><div className="text-xl text-fn-text-dim">Featured outfits</div></div>
        <button onClick={() => flash(m.claimDaily() ? "+100 R Bucks claimed!" : "Already claimed today")} className="bg-fn-yellow px-4 py-2 font-display text-xl tracking-wide text-fn-navy">CLAIM DAILY 100 R BUCKS</button>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {SKINS.filter((s) => s.source === "shop").map((s) => {
          const own = m.owned.includes(s.id);
          return (
            <div key={s.id} className="overflow-hidden border-2 border-hud/20" style={{ background: `linear-gradient(170deg, ${RARITY_COLORS[s.rarity]}, color-mix(in oklab, ${RARITY_COLORS[s.rarity]} 25%, black))` }}>
              <Preview skin={s} height="240px" />
              <div className="bg-fn-navy/70 p-3">
                <div className="font-display text-2xl leading-none tracking-wide">{s.name.toUpperCase()}</div>
                <div className="text-sm uppercase text-fn-text-dim">{RARITY_NAMES[s.rarity]} Outfit</div>
                <button disabled={own} onClick={() => { if (m.buy(s.id, s.price)) { sfx.chestOpen(); flash(`Purchased ${s.name}!`); } else flash("Not enough R Bucks"); }}
                  className={`mt-2 flex w-full items-center justify-center gap-2 py-1.5 font-display text-xl ${own ? "bg-ready/80" : "bg-hud text-fn-navy hover:brightness-95"}`}>
                  {own ? "OWNED" : <><RBuck />{s.price.toLocaleString()}</>}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </Page>
  );
}

function LockerTab() {
  const m = useMeta();
  const skin = SKINS.find((s) => s.id === m.equipped) ?? SKINS[0];
  return (
    <div className="absolute inset-x-0 bottom-12 top-[124px] z-10 flex">
      <div className="w-1/3 min-w-64"><Preview skin={skin} pedestal /></div>
      <div className="flex-1 overflow-y-auto p-6 pr-[6%]">
        <div className="font-display text-5xl tracking-wide">LOCKER</div>
        <div className="text-xl text-fn-text-dim">Outfit: {skin.name}</div>
        <div className="mt-4 grid grid-cols-3 gap-3 md:grid-cols-5">
          {SKINS.map((s) => {
            const own = m.owned.includes(s.id);
            return (
              <button key={s.id} disabled={!own} onClick={() => { sfx.click(); m.equip(s.id); }}
                className={`relative aspect-square border-4 p-2 text-left ${m.equipped === s.id ? "border-fn-yellow" : "border-transparent"} ${own ? "" : "opacity-35"}`}
                style={{ background: `linear-gradient(160deg, ${RARITY_COLORS[s.rarity]}, color-mix(in oklab, ${RARITY_COLORS[s.rarity]} 30%, black))` }}>
                <div className="absolute inset-x-2 bottom-2 font-display text-lg leading-none tracking-wide">{s.name.toUpperCase()}</div>
                {!own && <div className="text-xs">{s.source === "pass" ? "🔒 Battle Pass" : "🔒 Item Shop"}</div>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ProfileTab() {
  const m = useMeta();
  const lv = levelOf(m.xp);
  const stats = [["Level", lv.level], ["Battle Pass Tier", tierOf(m.xp)], ["Wins", m.wins], ["Matches", m.matches ?? 0], ["Win Rate", m.matches ? `${Math.round((m.wins / m.matches) * 100)}%` : "0%"], ["Eliminations", m.kills ?? 0], ["Outfits", `${m.owned.length}/${SKINS.length}`], ["Total XP", m.xp.toLocaleString()]];
  return (
    <Page>
      <div className="flex flex-wrap items-center gap-6">
        <Banner />
        <div>
          <div className="font-ui text-sm uppercase text-fn-text-dim">Display name</div>
          <input value={m.username} onChange={(e) => m.setUsername(e.target.value)} className="bg-fn-navy-2 px-3 py-1 font-display text-4xl tracking-wide outline-none ring-fn-yellow focus:ring-2" />
        </div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map(([k, v]) => (
          <div key={k} className="fn-panel-grad px-4 py-3"><div className="font-ui text-sm uppercase text-fn-text-dim">{k}</div><div className="font-display text-4xl tracking-wide">{v}</div></div>
        ))}
      </div>
    </Page>
  );
}

function seeded(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function LeaderboardTab() {
  const m = useMeta();
  const rows = useMemo(() => {
    const rnd = seeded(2017);
    const names = makeNames(60, rnd);
    let w = 2400;
    return names.map((n) => { w -= Math.floor(rnd() * 60); return { name: n, wins: w, kd: (1.5 + rnd() * 8).toFixed(2) }; });
  }, []);
  const all = [...rows, { name: m.username, wins: m.wins, kd: m.matches ? ((m.kills ?? 0) / Math.max(1, m.matches - m.wins)).toFixed(2) : "0.00", you: true }].sort((a, b) => b.wins - a.wins);
  const myRank = all.findIndex((r) => r.you) + 1;
  return (
    <Page>
      <div className="font-display text-5xl tracking-wide">LEADERBOARDS</div>
      <div className="text-xl text-fn-text-dim">Global · Wins · Your rank: #{myRank.toLocaleString()}</div>
      <div className="mt-4 max-w-3xl">
        <div className="grid grid-cols-[80px_1fr_120px_100px] bg-fn-panel-head px-4 py-1 font-ui text-sm uppercase"><span>Rank</span><span>Player</span><span className="text-right">Wins</span><span className="text-right">K/D</span></div>
        {all.slice(0, 50).map((r, i) => (
          <div key={r.name + i} className={`grid grid-cols-[80px_1fr_120px_100px] px-4 py-1.5 font-ui text-lg ${r.you ? "bg-fn-yellow text-fn-navy" : i % 2 ? "bg-fn-panel/50" : "bg-fn-panel/30"}`}>
            <span>#{i + 1}</span><span>{r.name}</span><span className="text-right">{r.wins.toLocaleString()}</span><span className="text-right">{r.kd}</span>
          </div>
        ))}
        {myRank > 50 && <div className="mt-1 grid grid-cols-[80px_1fr_120px_100px] bg-fn-yellow px-4 py-1.5 font-ui text-lg text-fn-navy"><span>#{myRank}</span><span>{m.username}</span><span className="text-right">{m.wins}</span><span className="text-right">—</span></div>}
      </div>
    </Page>
  );
}

function StoreTab({ flash }: { flash: (s: string) => void }) {
  const m = useMeta();
  const packs = [[1000, ""], [2800, "+300 bonus"], [5000, "+1,000 bonus"], [13500, "+3,500 bonus"]];
  return (
    <Page>
      <div className="font-display text-5xl tracking-wide">STORE</div>
      <div className="text-xl text-fn-text-dim">Real-money purchases aren't part of Project Rewind. Earn R Bucks from the Battle Pass and the daily claim.</div>
      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {packs.map(([n, b]) => (
          <div key={n} className="fn-panel-grad flex flex-col items-center gap-2 p-6 text-center opacity-80">
            <RBuck size={64} />
            <div className="font-display text-4xl tracking-wide">{n.toLocaleString()}</div>
            <div className="h-6 font-ui text-fn-yellow">{b}</div>
            <div className="w-full bg-fn-navy/60 py-1 font-ui uppercase text-fn-text-dim">Unavailable</div>
          </div>
        ))}
      </div>
      <button onClick={() => flash(m.claimDaily() ? "+100 R Bucks claimed!" : "Already claimed today")} className="mt-6 bg-fn-yellow px-6 py-3 font-display text-2xl tracking-wide text-fn-navy">CLAIM DAILY 100 R BUCKS</button>
    </Page>
  );
}

/* ---------------- icons ---------------- */

function RBuck({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-label="R Bucks">
      <circle cx="16" cy="16" r="14" style={{ fill: "var(--fn-panel-head)", stroke: "var(--fn-tab)", strokeWidth: 2.5 }} />
      <circle cx="16" cy="16" r="9.5" style={{ fill: "none", stroke: "var(--fn-navy)", strokeWidth: 1.5, opacity: 0.5 }} />
      <text x="16" y="21.5" textAnchor="middle" style={{ fill: "var(--hud)", font: "700 15px Anton, sans-serif" }}>R</text>
    </svg>
  );
}
function PartyIcon({ small }: { small?: boolean }) {
  const s = small ? 16 : 26;
  return (
    <svg width={s} height={s} viewBox="0 0 26 26" aria-hidden style={{ fill: "var(--hud)" }}>
      <circle cx="9" cy="8" r="4.2" /><path d="M1.5 22 Q2 14 9 14 Q16 14 16.5 22 Z" />
      <circle cx="18" cy="7" r="3.4" opacity="0.8" /><path d="M14 13.5 Q16 12.5 18 12.5 Q24 12.5 24.5 20 H18 Q17.5 15.5 14 13.5 Z" opacity="0.8" />
    </svg>
  );
}
function MusicIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
      <path d="M8 16 V4 L18 2 V14" style={{ fill: "none", stroke: "var(--hud)", strokeWidth: 2 }} />
      <circle cx="6" cy="16" r="2.6" style={{ fill: "var(--hud)" }} /><circle cx="16" cy="14" r="2.6" style={{ fill: "var(--hud)" }} />
      {muted && <path d="M2 2 L20 20" style={{ stroke: "var(--destructive)", strokeWidth: 2.5 }} />}
    </svg>
  );
}
function Star() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="11" style={{ fill: "var(--fn-gold-2)", stroke: "var(--fn-gold-1)", strokeWidth: 1.5 }} />
      <path d="M12 4.5 L14.2 9.3 L19.3 9.7 L15.4 13 L16.6 18 L12 15.3 L7.4 18 L8.6 13 L4.7 9.7 L9.8 9.3 Z" style={{ fill: "var(--fn-yellow)" }} />
    </svg>
  );
}
function XpBadge() {
  return <span className="flex h-5 items-center rounded-sm bg-fn-xp px-1 font-ui text-xs font-bold text-fn-navy">XP</span>;
}
function Medal() {
  return (
    <svg width="54" height="54" viewBox="0 0 54 54" aria-hidden>
      <path d="M8 18 L2 10 L14 12 Z M46 18 L52 10 L40 12 Z" style={{ fill: "var(--fn-gold-1)" }} />
      <circle cx="27" cy="27" r="20" style={{ fill: "var(--fn-gold-2)", stroke: "var(--fn-yellow)", strokeWidth: 3 }} />
      <path d="M27 13 L31 22 L41 23 L33.5 29.5 L36 39 L27 34 L18 39 L20.5 29.5 L13 23 L23 22 Z" style={{ fill: "var(--fn-yellow)" }} />
    </svg>
  );
}
function Banner() {
  return (
    <svg width="132" height="150" viewBox="0 0 132 150" aria-label="Banner">
      {/* wings */}
      <path d="M10 30 L28 22 L28 70 L14 62 Z M122 30 L104 22 L104 70 L118 62 Z" style={{ fill: "var(--fn-tab)", opacity: 0.85 }} />
      <path d="M2 40 L26 34 L26 56 Z M130 40 L106 34 L106 56 Z" style={{ fill: "var(--hud)", opacity: 0.6 }} />
      {/* shield frame */}
      <path d="M22 14 H110 V78 Q110 118 66 142 Q22 118 22 78 Z" style={{ fill: "var(--fn-tab)", stroke: "var(--hud)", strokeWidth: 3 }} />
      <path d="M32 24 H100 V76 Q100 108 66 128 Q32 108 32 76 Z" style={{ fill: "var(--shield)" }} />
      <path d="M32 24 H100 V48 Q66 58 32 48 Z" style={{ fill: "var(--hud)", opacity: 0.15 }} />
      {/* rewind emblem */}
      <path d="M66 52 L44 70 L66 88 Z M88 52 L66 70 L88 88 Z" style={{ fill: "var(--hud)" }} />
      <path d="M50 132 L66 146 L82 132" style={{ fill: "none", stroke: "var(--fn-tab)", strokeWidth: 5 }} />
    </svg>
  );
}
