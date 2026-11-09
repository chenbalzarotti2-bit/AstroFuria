import { useCallback, useEffect, useRef, useState } from "react";
import { AstroEngine, type EndStats, type HudData, type Phase } from "./game/engine";
import {
  MenuScreen,
  OverScreen,
  PauseScreen,
  ShipGlyph,
  pad6,
} from "./components/Screens";

function PowerSlot({
  label,
  tag,
  color,
  slotRef,
  barRef,
}: {
  label: string;
  tag: string;
  color: string;
  slotRef: React.MutableRefObject<HTMLDivElement | null>;
  barRef: React.MutableRefObject<HTMLDivElement | null>;
}) {
  return (
    <div ref={slotRef} className="power-slot w-[76px]">
      <div className="flex justify-between text-[9px] font-semibold tracking-[0.18em] text-[#8fb7d9]">
        <span style={{ color }}>{tag}</span>
        <span>{label}</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden bg-[#0a1a30]">
        <div ref={barRef} className="h-full" style={{ width: "0%", background: color }} />
      </div>
    </div>
  );
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<AstroEngine | null>(null);

  const [phase, setPhase] = useState<Phase>("menu");
  const phaseRef = useRef<Phase>("menu");
  const [stats, setStats] = useState<EndStats | null>(null);
  const [banner, setBanner] = useState<{ text: string; sub?: string; id: number } | null>(null);
  const [muted, setMuted] = useState(false);
  const [best, setBest] = useState(0);

  /* riferimenti HUD aggiornati a 60fps senza re-render */
  const scoreEl = useRef<HTMLSpanElement | null>(null);
  const bestEl = useRef<HTMLSpanElement | null>(null);
  const waveEl = useRef<HTMLSpanElement | null>(null);
  const multEl = useRef<HTMLSpanElement | null>(null);
  const comboBarEl = useRef<HTMLDivElement | null>(null);
  const livesEl = useRef<HTMLDivElement | null>(null);
  const slotT = useRef<HTMLDivElement | null>(null);
  const slotR = useRef<HTMLDivElement | null>(null);
  const slotS = useRef<HTMLDivElement | null>(null);
  const barT = useRef<HTMLDivElement | null>(null);
  const barR = useRef<HTMLDivElement | null>(null);
  const barS = useRef<HTMLDivElement | null>(null);
  const prevHud = useRef({ score: -1, best: -1, lives: -1, wave: -1, mult: -1 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const applyHud = (h: HudData) => {
      const p = prevHud.current;
      if (h.score !== p.score && scoreEl.current) scoreEl.current.textContent = pad6(h.score);
      if ((h.best !== p.best || h.score !== p.score) && bestEl.current)
        bestEl.current.textContent = pad6(Math.max(h.best, h.score));
      if (h.wave !== p.wave && waveEl.current)
        waveEl.current.textContent = String(h.wave).padStart(2, "0");
      if (h.comboMult !== p.mult && multEl.current) {
        multEl.current.textContent = `×${h.comboMult}`;
        multEl.current.classList.toggle("hot", h.comboMult > 1);
      }
      if (comboBarEl.current) comboBarEl.current.style.width = `${(h.comboFrac * 100).toFixed(1)}%`;

      const setBar = (
        slot: HTMLDivElement | null,
        bar: HTMLDivElement | null,
        frac: number
      ) => {
        if (bar) bar.style.width = `${(Math.max(0, Math.min(1, frac)) * 100).toFixed(1)}%`;
        if (slot) slot.classList.toggle("on", frac > 0);
      };
      setBar(slotT.current, barT.current, h.power.triple);
      setBar(slotR.current, barR.current, h.power.rapid);
      setBar(slotS.current, barS.current, h.power.shield);

      if (h.lives !== p.lives && livesEl.current) {
        const kids = livesEl.current.children;
        for (let i = 0; i < kids.length; i++) {
          kids[i].classList.toggle("on", i < h.lives);
        }
      }
      prevHud.current = {
        score: h.score,
        best: h.best,
        lives: h.lives,
        wave: h.wave,
        mult: h.comboMult,
      };
    };

    const eng = new AstroEngine(canvas, {
      onPhase: (p) => {
        phaseRef.current = p;
        setPhase(p);
      },
      onHud: applyHud,
      onBanner: (text, sub) => setBanner({ text, sub, id: Date.now() }),
      onGameOver: (s) => setStats(s),
      onMute: (m) => setMuted(m),
    });
    engineRef.current = eng;
    setMuted(eng.sfx.muted);
    setBest(eng.best);

    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Enter") {
        if (phaseRef.current === "menu" || phaseRef.current === "over") eng.start();
        else if (phaseRef.current === "paused") eng.resume();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      eng.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 2300);
    return () => clearTimeout(t);
  }, [banner]);

  const start = useCallback(() => {
    setStats(null);
    prevHud.current = { score: -1, best: -1, lives: -1, wave: -1, mult: -1 };
    engineRef.current?.start();
  }, []);
  const resume = () => engineRef.current?.resume();
  const quit = () => {
    engineRef.current?.toMenu();
    setBest(engineRef.current?.best ?? 0);
  };

  const inGame = phase === "playing" || phase === "paused";

  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-[#04070f]">
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 h-full w-full ${
          phase === "playing" ? "cursor-none" : "cursor-default"
        }`}
      />

      {/* effetti schermo */}
      <div className="fx-scan pointer-events-none absolute inset-0" />
      <div className="fx-vignette pointer-events-none absolute inset-0" />

      {/* HUD di gioco */}
      {inGame && (
        <div className="font-disp pointer-events-none absolute inset-0 p-3 md:p-5">
          {/* punteggio + combo */}
          <div className="absolute left-3 top-3 md:left-5 md:top-5">
            <div className="hud-panel cut-sm px-4 py-2.5">
              <div className="hud-label">Punteggio</div>
              <div className="mt-1 text-2xl font-bold leading-none tabular-nums text-white md:text-4xl">
                <span ref={scoreEl}>000000</span>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="hud-panel cut-sm flex items-center gap-2 px-2.5 py-1.5">
                <span ref={multEl} className="text-sm font-bold text-[#8fb7d9]">
                  ×1
                </span>
                <div className="h-1.5 w-16 overflow-hidden bg-[#0a1a30]">
                  <div
                    ref={comboBarEl}
                    className="h-full bg-[#ffb400]"
                    style={{ width: "0%" }}
                  />
                </div>
              </div>
              <span className="hud-label">Combo</span>
            </div>
          </div>

          {/* ondata + record + pulsanti */}
          <div className="absolute right-3 top-3 text-right md:right-5 md:top-5">
            <div className="hud-panel cut-sm px-4 py-2.5">
              <div className="flex items-start justify-end gap-6">
                <div>
                  <div className="hud-label">Ondata</div>
                  <div className="mt-1 text-2xl font-bold text-[#00f0ff] md:text-3xl">
                    <span ref={waveEl}>01</span>
                  </div>
                </div>
                <div>
                  <div className="hud-label">Record</div>
                  <div className="mt-1 text-2xl font-bold tabular-nums text-[#8fb7d9] md:text-3xl">
                    <span ref={bestEl}>000000</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="pointer-events-auto mt-2 flex justify-end gap-2">
              <button
                className="hud-btn"
                aria-label="Pausa"
                onClick={() => engineRef.current?.togglePause()}
              >
                {phase === "paused" ? (
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                    <path d="M7 4 L20 12 L7 20 Z" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                    <rect x="5" y="4" width="5" height="16" />
                    <rect x="14" y="4" width="5" height="16" />
                  </svg>
                )}
              </button>
              <button
                className="hud-btn"
                aria-label="Audio"
                onClick={() => engineRef.current?.toggleMute()}
              >
                {muted ? (
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 9 H8 L13 4 V20 L8 15 H4 Z" fill="currentColor" stroke="none" />
                    <path d="M16 9 L21 15 M21 9 L16 15" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 9 H8 L13 4 V20 L8 15 H4 Z" fill="currentColor" stroke="none" />
                    <path d="M16.5 8.5 A5 5 0 0 1 16.5 15.5 M19 6 A9 9 0 0 1 19 18" strokeLinecap="round" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* vite */}
          <div className="absolute bottom-3 left-3 md:bottom-5 md:left-5">
            <div className="hud-panel cut-sm px-4 py-2.5">
              <div className="hud-label mb-1.5">Navi</div>
              <div ref={livesEl} className="flex gap-2 text-[#00f0ff]">
                <ShipGlyph className="life on h-6 w-5" />
                <ShipGlyph className="life on h-6 w-5" />
                <ShipGlyph className="life on h-6 w-5" />
              </div>
            </div>
          </div>

          {/* potenziamenti */}
          <div className="absolute bottom-3 right-3 md:bottom-5 md:right-5">
            <div className="hud-panel cut-sm flex gap-4 px-4 py-2.5">
              <PowerSlot tag="T" label="TRIPLO" color="#ffb400" slotRef={slotT} barRef={barT} />
              <PowerSlot tag="R" label="RAPIDO" color="#ff2d78" slotRef={slotR} barRef={barR} />
              <PowerSlot tag="S" label="SCUDO" color="#00f0ff" slotRef={slotS} barRef={barS} />
            </div>
          </div>
        </div>
      )}

      {/* banner ondata */}
      {banner && inGame && (
        <div
          key={banner.id}
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <div className="banner-anim text-center">
            <div className="title-chroma font-disp text-4xl font-black tracking-[0.12em] text-white md:text-7xl">
              {banner.text}
            </div>
            {banner.sub && (
              <div className="font-disp mt-3 text-base font-bold tracking-[0.3em] text-[#ffb400] md:text-2xl">
                {banner.sub}
              </div>
            )}
          </div>
        </div>
      )}

      {/* schermate */}
      {phase === "menu" && <MenuScreen best={best} onStart={start} />}
      {phase === "paused" && <PauseScreen onResume={resume} onQuit={quit} />}
      {phase === "over" && stats && <OverScreen stats={stats} onRetry={start} onMenu={quit} />}
    </div>
  );
}
