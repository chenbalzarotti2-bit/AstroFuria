import type { ReactNode } from "react";
import type { EndStats } from "../game/engine";

export const pad6 = (n: number) => String(Math.max(0, Math.floor(n))).padStart(6, "0");

const fmtTime = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function ShipGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 2 L21 21 L12 16 L3 21 Z" strokeLinejoin="round" />
    </svg>
  );
}

export function KeyCap({ children }: { children: ReactNode }) {
  return <span className="keycap">{children}</span>;
}

const CONTROLS: Array<[string, string]> = [
  ["W / ↑", "Vola verso il puntatore — si ferma all'arrivo"],
  ["A · S · D", "Spostati rispetto al puntatore"],
  ["MOUSE", "Mira i cannoni"],
  ["CLICK / SPAZIO", "Fuoco"],
  ["P / ESC", "Pausa"],
  ["M", "Audio on / off"],
];

export function ControlsPanel() {
  return (
    <div className="hud-panel cut p-4 md:p-5">
      <div className="flex items-center justify-between">
        <span className="font-disp text-[11px] font-bold tracking-[0.3em] text-white">
          COMANDI DI VOLO
        </span>
        <span className="led-dot h-2 w-2 bg-[#00f0ff]" />
      </div>
      <div className="mt-3 space-y-2">
        {CONTROLS.map(([k, d]) => (
          <div key={k} className="flex items-center justify-between gap-3 text-xs text-[#9fc2e8]">
            <KeyCap>{k}</KeyCap>
            <span>{d}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 border-t border-[#123252] pt-3 text-[10px] leading-relaxed text-[#5f83ad]">
        Potenziali: <span className="font-bold text-[#ffb400]">T</span> fuoco triplo ·{" "}
        <span className="font-bold text-[#ff2d78]">R</span> cadenza rapida ·{" "}
        <span className="font-bold text-[#00f0ff]">S</span> scudo energetico
      </div>
    </div>
  );
}

/* ---------------- MENU ---------------- */

export function MenuScreen({ best, onStart }: { best: number; onStart: () => void }) {
  return (
    <div className="absolute inset-0 flex flex-col justify-between bg-[radial-gradient(ellipse_at_center,rgba(4,7,15,0.2)_0%,rgba(4,7,15,0.78)_100%)] p-5 md:p-10">
      <div className="rise flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-semibold tracking-[0.5em] text-[#ffb400] md:text-xs">
            SALA GIOCHI · CAB-01
          </div>
          <div className="mt-1 text-[10px] tracking-[0.3em] text-[#5f83ad] md:text-xs">
            SETTORE 7 — CINTURA DI KUIPER
          </div>
        </div>
        <div className="hud-panel cut-sm px-4 py-2 text-right">
          <div className="hud-label">Record locale</div>
          <div className="font-disp text-xl font-bold tabular-nums text-[#ffb400] md:text-2xl">
            {pad6(best)}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="rise rise-1">
          <h1 className="title-chroma font-disp text-[clamp(3rem,11vw,7.5rem)] font-black leading-[0.88] tracking-tight text-white">
            ASTRO
            <span className="block text-[#00f0ff]">FURIA</span>
          </h1>
          <p className="mt-4 max-w-md text-sm text-[#9fc2e8] md:text-base">
            Asteroidi, cacciatori e ondate infinite. Un blaster arcade{" "}
            <span className="font-semibold text-[#00f0ff]">100% offline</span>, leggero
            abbastanza da vivere su una chiavetta USB.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-[9px] tracking-[0.22em] text-[#5f83ad] md:text-[10px]">
            <span className="hud-panel cut-sm px-2.5 py-1">4 GB RAM ✓</span>
            <span className="hud-panel cut-sm px-2.5 py-1">GPU INTEGRATA ✓</span>
            <span className="hud-panel cut-sm px-2.5 py-1">MENO DI 1 MB</span>
            <span className="hud-panel cut-sm px-2.5 py-1">RECORD IN LOCALE</span>
          </div>
        </div>
        <div className="rise rise-2 w-full md:w-72">
          <ControlsPanel />
        </div>
      </div>

      <div className="rise rise-3 flex flex-col items-center gap-3 pb-1">
        <button
          className="btn-arcade pulse-start cut font-disp px-10 py-4 text-sm font-bold tracking-[0.25em] md:text-base"
          onClick={onStart}
        >
          AVVIA LA MISSIONE
        </button>
        <div className="blinker text-[11px] tracking-[0.45em] text-[#00f0ff] md:text-xs">
          PREMI INVIO
        </div>
      </div>
    </div>
  );
}

/* ---------------- PAUSA ---------------- */

export function PauseScreen({ onResume, onQuit }: { onResume: () => void; onQuit: () => void }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[rgba(3,6,14,0.72)] p-6">
      <div className="hud-panel cut rise w-full max-w-sm p-6 md:p-8">
        <div className="hud-label">Sistemi in standby</div>
        <h2 className="font-disp mt-1 text-4xl font-black tracking-wide text-white">PAUSA</h2>
        <div className="mt-6 flex flex-col gap-2.5">
          <button
            className="btn-arcade cut-sm font-disp px-6 py-3 text-sm font-bold tracking-[0.2em]"
            onClick={onResume}
          >
            RIPRENDI · ESC
          </button>
          <button
            className="btn-ghost cut-sm font-disp px-6 py-3 text-sm font-bold tracking-[0.2em]"
            onClick={onQuit}
          >
            ABBANDONA LA PARTITA
          </button>
        </div>
        <p className="mt-5 text-[11px] leading-relaxed text-[#5f83ad]">
          Punteggio e ondata restano congelati. Il record è al sicuro nel localStorage di
          questo PC… o della tua chiavetta.
        </p>
      </div>
    </div>
  );
}

/* ---------------- GAME OVER ---------------- */

function StatCell({ l, v, c = "#d9ecff" }: { l: string; v: string; c?: string }) {
  return (
    <div className="bg-[#060d1d] px-4 py-3">
      <div className="hud-label">{l}</div>
      <div className="font-disp mt-0.5 text-xl font-bold tabular-nums" style={{ color: c }}>
        {v}
      </div>
    </div>
  );
}

export function OverScreen({
  stats,
  onRetry,
  onMenu,
}: {
  stats: EndStats;
  onRetry: () => void;
  onMenu: () => void;
}) {
  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-y-auto bg-[rgba(3,6,14,0.72)] p-5">
      <div
        className="hud-panel cut rise w-full max-w-lg p-6 md:p-8"
        style={{ borderColor: "rgba(255,45,120,0.45)" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="hud-label" style={{ color: "rgba(255,45,120,0.8)" }}>
              Trasmissione interrotta
            </div>
            <h2
              className="font-disp mt-1 text-3xl font-black text-[#ff2d78] md:text-5xl"
              style={{ textShadow: "0 0 30px rgba(255,45,120,0.5)" }}
            >
              NAVE DISTRUTTA
            </h2>
          </div>
          {stats.newRecord && <div className="record-badge shrink-0">NUOVO RECORD</div>}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden border border-[#123252] bg-[#123252] md:grid-cols-3">
          <StatCell l="Punteggio" v={pad6(stats.score)} c="#ffb400" />
          <StatCell l="Record" v={pad6(stats.best)} />
          <StatCell l="Ondata" v={String(stats.wave).padStart(2, "0")} c="#00f0ff" />
          <StatCell l="Nemici" v={String(stats.kills)} />
          <StatCell l="Precisione" v={`${stats.accuracy}%`} />
          <StatCell l="Tempo" v={fmtTime(stats.time)} />
        </div>

        <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
          <button
            className="btn-arcade cut-sm font-disp flex-1 px-6 py-3.5 text-sm font-bold tracking-[0.18em]"
            onClick={onRetry}
          >
            RIENTRA IN BATTAGLIA · INVIO
          </button>
          <button
            className="btn-ghost cut-sm font-disp px-6 py-3.5 text-sm font-bold tracking-[0.18em]"
            onClick={onMenu}
          >
            MENU
          </button>
        </div>
      </div>
    </div>
  );
}
