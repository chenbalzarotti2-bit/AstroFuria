/* ASTROFURIA — motore arcade su canvas 2D.
   Tutto disegnato proceduralmente: nessuna immagine, nessun asset esterno.
   Pensato per GPU integrate: sprite-glow precalcolati, additivi leggeri,
   numero di particelle limitato, DPR capped a 1.5. */

import { SFX } from "./audio";

export type Phase = "menu" | "playing" | "paused" | "over";

export interface PowerState {
  triple: number;
  rapid: number;
  shield: number;
}
export interface HudData {
  score: number;
  best: number;
  lives: number;
  wave: number;
  comboMult: number;
  comboFrac: number;
  power: PowerState;
}
export interface EndStats {
  score: number;
  best: number;
  newRecord: boolean;
  wave: number;
  kills: number;
  accuracy: number;
  time: number;
}
export interface EngineCallbacks {
  onPhase: (p: Phase) => void;
  onHud: (h: HudData) => void;
  onBanner: (text: string, sub?: string) => void;
  onGameOver: (s: EndStats) => void;
  onMute: (m: boolean) => void;
}

const CYAN = "#00f0ff";
const MAG = "#ff2d78";
const AMBER = "#ffb400";
const WHITE = "#eaf6ff";
const AST_STROKE = "#8fc6ee";
const TAU = Math.PI * 2;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

interface Star {
  x: number;
  y: number;
  z: number;
  p: number;
  r: number;
}
interface Asteroid {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  size: 1 | 2 | 3;
  verts: number[];
  rot: number;
  vr: number;
}
interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}
interface Dart {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  hp: number;
  flash: number;
  ph: number;
}
interface PowerUp {
  x: number;
  y: number;
  vx: number;
  vy: number;
  type: 0 | 1 | 2;
  t: number;
  spin: number;
}
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  kind: 0 | 1 | 2; // 0 spark, 1 shard, 2 ring
  rot: number;
  vr: number;
  grow: number;
  drag: number;
}
interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
  big: boolean;
}

/* Glow sprite precalcolato: molto più economico di shadowBlur. */
const glowCache = new Map<string, HTMLCanvasElement>();
function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}
function glowSprite(color: string): HTMLCanvasElement {
  const cached = glowCache.get(color);
  if (cached) return cached;
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d")!;
  const [r, gr, b] = hexRgb(color);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, `rgba(${r},${gr},${b},0.6)`);
  grad.addColorStop(0.35, `rgba(${r},${gr},${b},0.22)`);
  grad.addColorStop(1, `rgba(${r},${gr},${b},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowCache.set(color, c);
  return c;
}

export class AstroEngine {
  readonly sfx = new SFX();
  phase: Phase = "menu";
  best = 0;

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cb: EngineCallbacks;
  private raf = 0;
  private last = performance.now();
  private tGlobal = 0;
  private dpr = 1;
  private W = 0;
  private H = 0;
  private S = 1;
  private bg: HTMLCanvasElement;

  private stars: Star[] = [];
  private asteroids: Asteroid[] = [];
  private bullets: Bullet[] = [];
  private darts: Dart[] = [];
  private powerups: PowerUp[] = [];
  private particles: Particle[] = [];
  private floaters: Floater[] = [];

  private keys = new Set<string>();
  private mouse = { x: 0, y: 0, down: false };
  private pl = { x: 0, y: 0, vx: 0, vy: 0, aim: -Math.PI / 2, alive: true, inv: 0 };
  private thrusting = false;

  private cooldown = 0;
  private score = 0;
  private lives = 3;
  private wave = 0;
  private comboKills = 0;
  private comboT = 0;
  private tripleT = 0;
  private rapidT = 0;
  private shieldT = 0;
  private pending = 0;
  private dartQ = 0;
  private spawnT = 0;
  private dartT = 0;
  private wavePending = false;
  private waveDelay = 0;
  private deathT = 0;
  private shake = 0;
  private flash = 0;
  private kills = 0;
  private shots = 0;
  private hits = 0;
  private elapsed = 0;

  private listeners: Array<[EventTarget, string, EventListener]> = [];

  constructor(canvas: HTMLCanvasElement, cb: EngineCallbacks) {
    this.canvas = canvas;
    this.cb = cb;
    this.ctx = canvas.getContext("2d")!;
    this.bg = document.createElement("canvas");
    try {
      this.best = Number(localStorage.getItem("astrofuria_best") || 0) || 0;
    } catch {
      this.best = 0;
    }
    this.mouse.x = window.innerWidth / 2;
    this.mouse.y = window.innerHeight * 0.35;
    this.pl.x = window.innerWidth / 2;
    this.pl.y = window.innerHeight / 2;

    this.onResize();
    this.seedMenuField();

    const on = (t: EventTarget, e: string, f: EventListener) => {
      t.addEventListener(e, f);
      this.listeners.push([t, e, f]);
    };
    on(window, "resize", this.onResize);
    on(window, "keydown", this.onKeyDown);
    on(window, "keyup", this.onKeyUp);
    on(window, "mousemove", this.onMouseMove);
    on(window, "mousedown", this.onMouseDown);
    on(window, "mouseup", this.onMouseUp);
    on(document, "visibilitychange", this.onVis);
    on(window, "blur", this.onBlur);
    on(canvas, "contextmenu", this.onCtxMenu);

    this.raf = requestAnimationFrame(this.tick);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    for (const [t, e, f] of this.listeners) t.removeEventListener(e, f);
    this.listeners = [];
  }

  /* ================= API pubblica ================= */

  start() {
    this.sfx.unlock();
    this.score = 0;
    this.lives = 3;
    this.kills = 0;
    this.shots = 0;
    this.hits = 0;
    this.elapsed = 0;
    this.comboKills = 0;
    this.comboT = 0;
    this.tripleT = 0;
    this.rapidT = 0;
    this.shieldT = 0;
    this.bullets = [];
    this.darts = [];
    this.powerups = [];
    this.floaters = [];
    this.particles = [];
    this.asteroids = [];
    this.pl = {
      x: this.W / 2,
      y: this.H / 2,
      vx: 0,
      vy: 0,
      aim: -Math.PI / 2,
      alive: true,
      inv: 2,
    };
    this.wavePending = false;
    this.shake = 0;
    this.flash = 0;
    this.phase = "playing";
    this.cb.onPhase("playing");
    this.startWave(1);
    this.sfx.ui();
  }

  pause() {
    if (this.phase === "playing") {
      this.phase = "paused";
      this.cb.onPhase("paused");
      this.sfx.ui();
    }
  }

  resume() {
    if (this.phase === "paused") {
      this.sfx.unlock();
      this.phase = "playing";
      this.cb.onPhase("playing");
      this.sfx.ui();
    }
  }

  togglePause() {
    if (this.phase === "playing") this.pause();
    else if (this.phase === "paused") this.resume();
  }

  toMenu() {
    this.phase = "menu";
    this.bullets = [];
    this.darts = [];
    this.powerups = [];
    this.floaters = [];
    this.particles = [];
    this.seedMenuField();
    this.cb.onPhase("menu");
  }

  toggleMute() {
    this.sfx.unlock();
    this.cb.onMute(this.sfx.toggleMute());
  }

  /* ================= input ================= */

  private onCtxMenu = (e: Event) => e.preventDefault();

  private onKeyDown = (e: Event) => {
    const ev = e as KeyboardEvent;
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(ev.code)) {
      ev.preventDefault();
    }
    if (!ev.repeat) {
      if (ev.code === "KeyM") this.toggleMute();
      if (ev.code === "KeyP" || ev.code === "Escape") this.togglePause();
    }
    this.keys.add(ev.code);
  };

  private onKeyUp = (e: Event) => {
    this.keys.delete((e as KeyboardEvent).code);
  };

  private onMouseMove = (e: Event) => {
    const ev = e as MouseEvent;
    this.mouse.x = ev.clientX;
    this.mouse.y = ev.clientY;
  };

  private onMouseDown = (e: Event) => {
    const ev = e as MouseEvent;
    if (ev.button !== 0) return;
    const target = ev.target as HTMLElement | null;
    if (target && target.closest("button")) return;
    this.sfx.unlock();
    this.mouse.down = true;
  };

  private onMouseUp = () => {
    this.mouse.down = false;
  };

  private onVis = () => {
    if (document.hidden) this.pause();
  };

  private onBlur = () => {
    this.keys.clear();
    this.mouse.down = false;
  };

  private onResize = () => {
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.canvas.width = Math.max(1, Math.round(this.W * this.dpr));
    this.canvas.height = Math.max(1, Math.round(this.H * this.dpr));
    this.S = clamp(Math.min(this.W, this.H) / 820, 0.72, 1.25);
    this.buildBg();
    this.seedStars();
  };

  /* ================= setup mondo ================= */

  private buildBg() {
    const { W, H, dpr } = this;
    this.bg.width = Math.max(1, Math.round(W * dpr));
    this.bg.height = Math.max(1, Math.round(H * dpr));
    const b = this.bg.getContext("2d")!;
    b.setTransform(dpr, 0, 0, dpr, 0, 0);
    const lg = b.createLinearGradient(0, 0, 0, H);
    lg.addColorStop(0, "#070b18");
    lg.addColorStop(0.5, "#04070f");
    lg.addColorStop(1, "#080a1c");
    b.fillStyle = lg;
    b.fillRect(0, 0, W, H);
    const blob = (x: number, y: number, r: number, color: string) => {
      const g = b.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, color);
      g.addColorStop(1, "rgba(0,0,0,0)");
      b.fillStyle = g;
      b.fillRect(0, 0, W, H);
    };
    blob(W * 0.22, H * 0.16, Math.max(W, H) * 0.5, "rgba(0,160,255,0.07)");
    blob(W * 0.84, H * 0.86, Math.max(W, H) * 0.55, "rgba(255,45,120,0.055)");
    blob(W * 0.68, H * 0.22, Math.max(W, H) * 0.32, "rgba(255,180,0,0.03)");
  }

  private seedStars() {
    const n = Math.round(clamp((this.W * this.H) / 8000, 90, 240));
    this.stars = [];
    for (let i = 0; i < n; i++) {
      this.stars.push({
        x: rand(0, this.W),
        y: rand(0, this.H),
        z: rand(0.25, 1),
        p: rand(0, TAU),
        r: rand(0.6, 1.9),
      });
    }
  }

  private seedMenuField() {
    this.asteroids = [];
    const sizes: Array<1 | 2 | 3> = [3, 2, 3, 1, 2, 3, 2];
    for (let i = 0; i < sizes.length; i++) {
      this.asteroids.push(
        this.makeAsteroid(sizes[i], rand(0, this.W), rand(0, this.H))
      );
    }
  }

  private makeAsteroid(size: 1 | 2 | 3, x: number, y: number): Asteroid {
    const base = size === 3 ? 40 : size === 2 ? 25 : 13;
    const r = base * this.S * rand(0.85, 1.15);
    const n = 10 + Math.floor(Math.random() * 4);
    const verts: number[] = [];
    for (let i = 0; i < n; i++) verts.push(rand(0.72, 1.08));
    const a = rand(0, TAU);
    const sp =
      (150 - size * 32) *
      rand(0.7, 1.25) *
      (1 + Math.min(this.wave, 12) * 0.045) *
      this.S;
    return {
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      r,
      size,
      verts,
      rot: rand(0, TAU),
      vr: rand(-1.4, 1.4),
    };
  }

  private edgeSpawn(): [number, number] {
    for (let i = 0; i < 10; i++) {
      let x = 0;
      let y = 0;
      const side = Math.floor(Math.random() * 4);
      if (side === 0) {
        x = rand(-50, this.W + 50);
        y = -55;
      } else if (side === 1) {
        x = this.W + 55;
        y = rand(-50, this.H + 50);
      } else if (side === 2) {
        x = rand(-50, this.W + 50);
        y = this.H + 55;
      } else {
        x = -55;
        y = rand(-50, this.H + 50);
      }
      const dx = x - this.pl.x;
      const dy = y - this.pl.y;
      if (dx * dx + dy * dy > 200 * 200) return [x, y];
    }
    return [this.W + 55, rand(0, this.H)];
  }

  private spawnAsteroid(size: 1 | 2 | 3) {
    const [x, y] = this.edgeSpawn();
    this.asteroids.push(this.makeAsteroid(size, x, y));
  }

  private spawnDart() {
    const [x, y] = this.edgeSpawn();
    this.darts.push({ x, y, vx: 0, vy: 0, t: 0, hp: 2, flash: 0, ph: rand(0, TAU) });
  }

  /* ================= flusso di gioco ================= */

  private startWave(n: number) {
    this.wave = n;
    this.pending = Math.min(3 + n, 10);
    this.dartQ = n >= 2 ? Math.min(n - 1, 6) : 0;
    this.spawnT = 0.5;
    this.dartT = 2.6;
    this.cb.onBanner(`ONDATA ${n}`, n === 1 ? "VIA!" : "MINACCIA CRESCENTE");
  }

  private waveCleared() {
    const bonus = 350 + this.wave * 150;
    this.score += bonus;
    this.cb.onBanner(`ONDATA ${this.wave} SUPERATA`, `BONUS +${bonus}`);
    this.floaters.push({
      x: this.W / 2,
      y: this.H / 2 - 70,
      text: `+${bonus}`,
      color: AMBER,
      t: 0,
      big: true,
    });
    this.sfx.wave();
    this.wavePending = true;
    this.waveDelay = 2.4;
  }

  private comboMult(): number {
    return 1 + Math.min(Math.floor(this.comboKills / 5), 7);
  }

  private addScore(base: number, x: number, y: number) {
    this.comboKills++;
    this.comboT = 3.5;
    const m = this.comboMult();
    const pts = base * m;
    this.score += pts;
    this.floaters.push({
      x: x + rand(-8, 8),
      y: y - 12,
      text: m > 1 ? `+${pts} ×${m}` : `+${pts}`,
      color: m > 1 ? AMBER : WHITE,
      t: 0,
      big: false,
    });
    if (this.floaters.length > 22) this.floaters.shift();
  }

  private maybeDrop(x: number, y: number, chance: number) {
    if (Math.random() > chance || this.powerups.length >= 3) return;
    const roll = Math.random();
    const type = (roll < 0.38 ? 0 : roll < 0.76 ? 1 : 2) as 0 | 1 | 2;
    this.powerups.push({
      x,
      y,
      vx: rand(-18, 18),
      vy: rand(-18, 18),
      type,
      t: 0,
      spin: rand(0, TAU),
    });
  }

  private burst(x: number, y: number, color: string, power: number) {
    this.particles.push({
      x,
      y,
      vx: 0,
      vy: 0,
      life: 0.42,
      max: 0.42,
      size: power * 8,
      color,
      kind: 2,
      rot: 0,
      vr: 0,
      grow: 240 + power * 90,
      drag: 0,
    });
    const n = Math.min(14 + power * 7, 34);
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const sp = rand(40, 130 + power * 90);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(0.25, 0.6),
        max: 0.6,
        size: rand(2, 4.5) * (0.8 + power * 0.15),
        color: Math.random() < 0.3 ? WHITE : color,
        kind: 0,
        rot: 0,
        vr: 0,
        grow: 0,
        drag: 2.4,
      });
    }
    const shards = 3 + power;
    for (let i = 0; i < shards; i++) {
      const a = rand(0, TAU);
      const sp = rand(60, 190);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(0.4, 0.8),
        max: 0.8,
        size: rand(5, 11),
        color,
        kind: 1,
        rot: a,
        vr: rand(-7, 7),
        grow: 0,
        drag: 1.6,
      });
    }
    if (this.particles.length > 460) {
      this.particles.splice(0, this.particles.length - 460);
    }
  }

  private destroyAsteroid(index: number) {
    const a = this.asteroids[index];
    this.asteroids.splice(index, 1);
    const base = a.size === 3 ? 20 : a.size === 2 ? 50 : 100;
    this.addScore(base, a.x, a.y);
    this.kills++;
    const col = a.size === 3 ? "#9fd4ff" : a.size === 2 ? CYAN : WHITE;
    this.burst(a.x, a.y, col, a.size);
    this.sfx.boom(a.size);
    this.shake = Math.min(26, this.shake + 2 + a.size * 1.6);
    if (a.size > 1) {
      const ns = (a.size - 1) as 1 | 2;
      for (let k = 0; k < 2; k++) {
        const child = this.makeAsteroid(ns, a.x + rand(-8, 8), a.y + rand(-8, 8));
        const away = rand(0, TAU);
        const sp = rand(50, 140) * this.S;
        child.vx = Math.cos(away) * sp;
        child.vy = Math.sin(away) * sp;
        child.vr = rand(-2.4, 2.4);
        this.asteroids.push(child);
      }
    }
    this.maybeDrop(a.x, a.y, 0.16);
  }

  private applyPower(type: 0 | 1 | 2, x: number, y: number) {
    if (type === 0) {
      this.tripleT = 10;
      this.floaters.push({ x, y: y - 16, text: "TRIPLO!", color: AMBER, t: 0, big: false });
    } else if (type === 1) {
      this.rapidT = 8;
      this.floaters.push({ x, y: y - 16, text: "RAPIDO!", color: MAG, t: 0, big: false });
    } else {
      this.shieldT = 12;
      this.floaters.push({ x, y: y - 16, text: "SCUDO!", color: CYAN, t: 0, big: false });
    }
    const cols = [AMBER, MAG, CYAN];
    this.burst(x, y, cols[type], 2);
    this.sfx.power();
  }

  private breakShield() {
    this.shieldT = 0;
    this.burst(this.pl.x, this.pl.y, CYAN, 3);
    this.sfx.shieldBreak();
    this.shake = Math.min(26, this.shake + 9);
  }

  private playerHit() {
    const pl = this.pl;
    this.lives--;
    this.comboKills = 0;
    this.comboT = 0;
    this.burst(pl.x, pl.y, CYAN, 4);
    this.burst(pl.x, pl.y, MAG, 3);
    this.sfx.hitPlayer();
    this.flash = 1;
    this.shake = Math.min(30, this.shake + 22);
    pl.alive = false;
    this.deathT = 1.5;
  }

  private respawn() {
    const pl = this.pl;
    pl.x = this.W / 2;
    pl.y = this.H / 2;
    pl.vx = 0;
    pl.vy = 0;
    pl.inv = 2.6;
    pl.alive = true;
    for (let i = this.asteroids.length - 1; i >= 0; i--) {
      const a = this.asteroids[i];
      if (Math.hypot(a.x - pl.x, a.y - pl.y) < 230) {
        this.asteroids.splice(i, 1);
        this.burst(a.x, a.y, AST_STROKE, 1);
      }
    }
    for (let i = this.darts.length - 1; i >= 0; i--) {
      const d = this.darts[i];
      if (Math.hypot(d.x - pl.x, d.y - pl.y) < 270) {
        this.darts.splice(i, 1);
        this.burst(d.x, d.y, MAG, 1);
      }
    }
    this.burst(pl.x, pl.y, CYAN, 2);
  }

  private endGame() {
    const newRecord = this.score > this.best;
    if (newRecord) {
      this.best = this.score;
      try {
        localStorage.setItem("astrofuria_best", String(this.best));
      } catch {
        /* ignora */
      }
    }
    this.phase = "over";
    this.cb.onPhase("over");
    this.cb.onGameOver({
      score: this.score,
      best: this.best,
      newRecord,
      wave: this.wave,
      kills: this.kills,
      accuracy: this.shots > 0 ? Math.round((this.hits / this.shots) * 100) : 0,
      time: this.elapsed,
    });
    this.sfx.over();
  }

  /* ================= loop ================= */

  private tick = (t: number) => {
    this.raf = requestAnimationFrame(this.tick);
    const dt = clamp((t - this.last) / 1000, 0, 0.033);
    this.last = t;
    this.tGlobal += dt;
    if (this.phase === "playing") this.update(dt);
    else if (this.phase === "menu" || this.phase === "over") this.updateAmbient(dt);
    this.draw();
  };

  private wrapPos(o: { x: number; y: number }, m: number) {
    if (o.x < -m) o.x = this.W + m;
    else if (o.x > this.W + m) o.x = -m;
    if (o.y < -m) o.y = this.H + m;
    else if (o.y > this.H + m) o.y = -m;
  }

  private updateFx(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const dmp = Math.exp(-p.drag * dt);
      p.vx *= dmp;
      p.vy *= dmp;
      p.rot += p.vr * dt;
      if (p.kind === 2) p.size += p.grow * dt;
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.t += dt;
      f.y -= 34 * dt;
      if (f.t > 1) this.floaters.splice(i, 1);
    }
    this.shake = Math.max(0, this.shake - dt * 42);
    this.flash = Math.max(0, this.flash - dt * 2.4);
  }

  private updateAmbient(dt: number) {
    for (const a of this.asteroids) {
      a.x += a.vx * dt * 0.55;
      a.y += a.vy * dt * 0.55;
      a.rot += a.vr * dt;
      this.wrapPos(a, a.r + 20);
    }
    for (const d of this.darts) {
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      this.wrapPos(d, 40);
    }
    this.updateFx(dt);
  }

  private shoot() {
    const pl = this.pl;
    this.cooldown = this.rapidT > 0 ? 0.075 : 0.17;
    const angles = this.tripleT > 0 ? [-0.17, 0, 0.17] : [0];
    const nx = pl.x + Math.cos(pl.aim) * 18;
    const ny = pl.y + Math.sin(pl.aim) * 18;
    for (const off of angles) {
      const a = pl.aim + off + rand(-0.015, 0.015);
      const spd = 680 * Math.max(0.85, this.S);
      this.bullets.push({
        x: nx,
        y: ny,
        vx: Math.cos(a) * spd + pl.vx * 0.25,
        vy: Math.sin(a) * spd + pl.vy * 0.25,
        life: 1,
      });
      this.shots++;
    }
    this.sfx.shoot();
    this.particles.push({
      x: nx,
      y: ny,
      vx: Math.cos(pl.aim) * 60,
      vy: Math.sin(pl.aim) * 60,
      life: 0.08,
      max: 0.08,
      size: 14,
      color: CYAN,
      kind: 0,
      rot: 0,
      vr: 0,
      grow: 0,
      drag: 0,
    });
    if (this.bullets.length > 120) this.bullets.splice(0, this.bullets.length - 120);
  }

  private update(dt: number) {
    const pl = this.pl;
    this.elapsed += dt;

    this.cooldown -= dt;
    if (pl.inv > 0) pl.inv -= dt;
    this.tripleT = Math.max(0, this.tripleT - dt);
    this.rapidT = Math.max(0, this.rapidT - dt);
    this.shieldT = Math.max(0, this.shieldT - dt);
    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) this.comboKills = 0;
    }

    this.thrusting = false;
    if (pl.alive) {
      /* --- comandi: W vola verso il puntatore e si ferma esattamente lì;
             A/S/D spostano la nave rispetto al puntatore --- */
      const wantGo = this.keys.has("KeyW") || this.keys.has("ArrowUp");
      let ix = 0;
      let iy = 0;
      if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) ix -= 1;
      if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) ix += 1;
      if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) iy += 1;

      const m = this.mouse;
      const dx = m.x - pl.x;
      const dy = m.y - pl.y;
      const dist = Math.hypot(dx, dy);

      if (wantGo) {
        /* molla critico-smorzata verso il puntatore: arriva senza rimbalzare */
        const K = 70;
        const C = 17;
        pl.vx += (dx * K - pl.vx * C) * dt;
        pl.vy += (dy * K - pl.vy * C) * dt;
        const gsp = Math.hypot(pl.vx, pl.vy);
        const gmax = 640 * Math.max(0.85, this.S);
        if (gsp > gmax) {
          pl.vx = (pl.vx / gsp) * gmax;
          pl.vy = (pl.vy / gsp) * gmax;
        }
        /* una volta raggiunto: fermo netto in quel punto */
        if (dist < 3 && gsp < 40) {
          pl.x = m.x;
          pl.y = m.y;
          pl.vx = 0;
          pl.vy = 0;
        }
      }

      if (ix !== 0 || iy !== 0) {
        const il = Math.hypot(ix, iy);
        pl.vx += (ix / il) * 980 * dt;
        pl.vy += (iy / il) * 980 * dt;
      }

      const damp = Math.exp(-(wantGo ? 0 : 3.4) * dt);
      pl.vx *= damp;
      pl.vy *= damp;
      const sp = Math.hypot(pl.vx, pl.vy);
      const max = 400 * this.S;
      if (!wantGo && sp > max) {
        pl.vx = (pl.vx / sp) * max;
        pl.vy = (pl.vy / sp) * max;
      }
      pl.x = clamp(pl.x + pl.vx * dt, 16, this.W - 16);
      pl.y = clamp(pl.y + pl.vy * dt, 16, this.H - 16);
      if (pl.x === 16 || pl.x === this.W - 16) pl.vx = 0;
      if (pl.y === 16 || pl.y === this.H - 16) pl.vy = 0;

      const moving = sp > 50;
      this.thrusting = moving;
      if (moving && Math.random() < 0.85) {
        const ba = Math.atan2(-pl.vy, -pl.vx) + rand(-0.3, 0.3);
        this.particles.push({
          x: pl.x + Math.cos(ba) * 14,
          y: pl.y + Math.sin(ba) * 14,
          vx: Math.cos(ba) * rand(60, 140) + pl.vx * 0.3,
          vy: Math.sin(ba) * rand(60, 140) + pl.vy * 0.3,
          life: rand(0.2, 0.42),
          max: 0.42,
          size: rand(2, 3.6),
          color: Math.random() < 0.5 ? AMBER : CYAN,
          kind: 0,
          rot: 0,
          vr: 0,
          grow: 0,
          drag: 2.2,
        });
      }
      if (dist > 3) pl.aim = Math.atan2(dy, dx);

      if ((this.mouse.down || this.keys.has("Space")) && this.cooldown <= 0) {
        this.shoot();
      }
    } else {
      this.deathT -= dt;
      if (this.deathT <= 0) {
        if (this.lives > 0) this.respawn();
        else this.endGame();
      }
    }

    /* spawning ondata */
    if (this.pending > 0) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnAsteroid(3);
        this.pending--;
        this.spawnT = Math.max(0.35, 0.85 - this.wave * 0.035);
      }
    }
    if (this.dartQ > 0 && pl.alive) {
      this.dartT -= dt;
      if (this.dartT <= 0) {
        this.spawnDart();
        this.dartQ--;
        this.dartT = 1.7;
      }
    }

    /* proiettili */
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < -40 || b.x > this.W + 40 || b.y < -40 || b.y > this.H + 40) {
        this.bullets.splice(i, 1);
      }
    }

    /* asteroidi */
    for (const a of this.asteroids) {
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      a.rot += a.vr * dt;
      this.wrapPos(a, a.r + 12);
    }

    /* cacciatori */
    for (const d of this.darts) {
      d.t += dt;
      d.flash = Math.max(0, d.flash - dt);
      const dx = pl.x - d.x;
      const dy = pl.y - d.y;
      const dist = Math.hypot(dx, dy) || 1;
      const spd = Math.min(250, 150 + this.wave * 8) * this.S;
      const k = 1 - Math.exp(-1.8 * dt);
      if (pl.alive) {
        d.vx += ((dx / dist) * spd - d.vx) * k;
        d.vy += ((dy / dist) * spd - d.vy) * k;
      }
      const vmag = Math.hypot(d.vx, d.vy) || 1;
      const px = -d.vy / vmag;
      const py = d.vx / vmag;
      const sw = Math.sin(d.t * 3.4 + d.ph) * 70;
      d.x += (d.vx + px * sw) * dt;
      d.y += (d.vy + py * sw) * dt;
      this.wrapPos(d, 30);
    }

    /* power-up */
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const p = this.powerups[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.t += dt;
      if (p.t > 13) this.powerups.splice(i, 1);
    }

    /* proiettile vs asteroide */
    for (let i = this.asteroids.length - 1; i >= 0; i--) {
      const a = this.asteroids[i];
      for (let j = this.bullets.length - 1; j >= 0; j--) {
        const b = this.bullets[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const rr = a.r + 5;
        if (dx * dx + dy * dy < rr * rr) {
          this.bullets.splice(j, 1);
          this.hits++;
          this.destroyAsteroid(i);
          break;
        }
      }
    }

    /* proiettile vs cacciatore */
    for (let i = this.darts.length - 1; i >= 0; i--) {
      const d = this.darts[i];
      for (let j = this.bullets.length - 1; j >= 0; j--) {
        const b = this.bullets[j];
        const dx = d.x - b.x;
        const dy = d.y - b.y;
        if (dx * dx + dy * dy < 22 * 22) {
          this.bullets.splice(j, 1);
          this.hits++;
          d.hp--;
          d.flash = 0.12;
          this.burst(b.x, b.y, MAG, 1);
          this.sfx.hit();
          if (d.hp <= 0) {
            this.darts.splice(i, 1);
            this.kills++;
            this.addScore(250, d.x, d.y);
            this.burst(d.x, d.y, MAG, 3);
            this.sfx.boom(2);
            this.shake = Math.min(26, this.shake + 6);
            this.maybeDrop(d.x, d.y, 0.3);
          }
          break;
        }
      }
    }

    /* giocatore: raccolta e collisioni */
    if (pl.alive) {
      for (let i = this.powerups.length - 1; i >= 0; i--) {
        const p = this.powerups[i];
        const dx = pl.x - p.x;
        const dy = pl.y - p.y;
        if (dx * dx + dy * dy < 30 * 30) {
          this.powerups.splice(i, 1);
          this.applyPower(p.type, p.x, p.y);
        }
      }
      if (pl.inv <= 0) {
        for (let i = this.asteroids.length - 1; i >= 0; i--) {
          const a = this.asteroids[i];
          const dx = pl.x - a.x;
          const dy = pl.y - a.y;
          const rr = a.r + 13;
          if (dx * dx + dy * dy < rr * rr) {
            if (this.shieldT > 0) {
              this.breakShield();
              this.destroyAsteroid(i);
            } else {
              this.playerHit();
            }
            break;
          }
        }
      }
      if (pl.alive && pl.inv <= 0) {
        for (let i = this.darts.length - 1; i >= 0; i--) {
          const d = this.darts[i];
          const dx = pl.x - d.x;
          const dy = pl.y - d.y;
          if (dx * dx + dy * dy < 28 * 28) {
            if (this.shieldT > 0) {
              this.breakShield();
              this.darts.splice(i, 1);
              this.burst(d.x, d.y, MAG, 2);
              this.sfx.boom(2);
            } else {
              this.playerHit();
            }
            break;
          }
        }
      }
    }

    /* avanzamento ondata */
    if (
      !this.wavePending &&
      this.pending === 0 &&
      this.dartQ === 0 &&
      this.asteroids.length === 0 &&
      this.darts.length === 0
    ) {
      this.waveCleared();
    }
    if (this.wavePending) {
      this.waveDelay -= dt;
      if (this.waveDelay <= 0) {
        this.wavePending = false;
        this.startWave(this.wave + 1);
      }
    }

    this.updateFx(dt);

    this.cb.onHud({
      score: this.score,
      best: this.best,
      lives: this.lives,
      wave: this.wave,
      comboMult: this.comboMult(),
      comboFrac: this.comboKills > 0 ? clamp(this.comboT / 3.5, 0, 1) : 0,
      power: {
        triple: this.tripleT / 10,
        rapid: this.rapidT / 8,
        shield: this.shieldT / 12,
      },
    });
  }

  /* ================= rendering ================= */

  private draw() {
    const { ctx, W, H } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.drawImage(this.bg, 0, 0, W, H);

    const sh = this.shake;
    if (sh > 0) ctx.translate(rand(-sh, sh) * 0.5, rand(-sh, sh) * 0.5);

    this.drawStars(ctx);
    this.drawPowerups(ctx);
    this.drawAsteroids(ctx);
    this.drawDarts(ctx);
    this.drawBullets(ctx);
    if (this.phase !== "menu") this.drawPlayer(ctx);
    this.drawParticles(ctx);
    this.drawFloaters(ctx);
    if (this.phase === "playing") this.drawReticle(ctx);

    if (this.flash > 0) {
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.fillStyle = `rgba(255,45,90,${(this.flash * 0.26).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  private drawStars(ctx: CanvasRenderingContext2D) {
    const usePar = this.phase === "playing" || this.phase === "paused";
    const px = usePar ? this.W / 2 - this.pl.x : 0;
    const py = usePar ? this.H / 2 - this.pl.y : 0;
    for (const s of this.stars) {
      const tw = 0.45 + 0.55 * Math.sin(this.tGlobal * (0.6 + s.z) + s.p);
      ctx.globalAlpha = tw * (0.22 + s.z * 0.6);
      ctx.fillStyle = s.z > 0.75 ? "#dff4ff" : "#7fa8cc";
      let x = s.x + px * s.z * 0.045;
      let y = s.y + py * s.z * 0.045;
      x = ((x % this.W) + this.W) % this.W;
      y = ((y % this.H) + this.H) % this.H;
      ctx.fillRect(x, y, s.r, s.r);
    }
    ctx.globalAlpha = 1;
  }

  private drawAsteroids(ctx: CanvasRenderingContext2D) {
    const glow = glowSprite("#2a6db5");
    for (const a of this.asteroids) {
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(a.rot);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.15;
      ctx.drawImage(glow, -a.r * 1.6, -a.r * 1.6, a.r * 3.2, a.r * 3.2);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.beginPath();
      const n = a.verts.length;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * TAU;
        const rr = a.r * a.verts[i];
        const x = Math.cos(ang) * rr;
        const y = Math.sin(ang) * rr;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = "rgba(13,28,52,0.88)";
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = a.size === 1 ? "#bfe3ff" : AST_STROKE;
      ctx.stroke();
      ctx.strokeStyle = "rgba(143,198,238,0.22)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(a.r * 0.25, -a.r * 0.15, a.r * 0.32, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawDarts(ctx: CanvasRenderingContext2D) {
    const glow = glowSprite(MAG);
    for (const d of this.darts) {
      const ang = Math.atan2(d.vy, d.vx);
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(ang);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.5;
      ctx.drawImage(glow, -23, -23, 46, 46);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(-11, 10);
      ctx.lineTo(-6, 0);
      ctx.lineTo(-11, -10);
      ctx.closePath();
      ctx.fillStyle = "rgba(52,8,28,0.92)";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = d.flash > 0 ? "#ffffff" : MAG;
      ctx.stroke();
      ctx.globalCompositeOperation = "lighter";
      const fl = 0.5 + 0.5 * Math.sin(d.t * 28);
      ctx.globalAlpha = 0.35 + fl * 0.35;
      ctx.drawImage(glow, -16, -7, 14, 14);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  private drawBullets(ctx: CanvasRenderingContext2D) {
    const glow = glowSprite(CYAN);
    ctx.globalCompositeOperation = "lighter";
    for (const b of this.bullets) {
      ctx.globalAlpha = 0.85;
      ctx.drawImage(glow, b.x - 11, b.y - 11, 22, 22);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "#d8ffff";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.014, b.y - b.vy * 0.014);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  private drawPlayer(ctx: CanvasRenderingContext2D) {
    const pl = this.pl;
    if (!pl.alive) return;

    if (this.shieldT > 0) {
      const low = this.shieldT < 2;
      const a = low
        ? 0.25 + 0.25 * Math.sin(this.tGlobal * 18)
        : 0.4 + 0.25 * Math.sin(this.tGlobal * 5);
      ctx.save();
      ctx.translate(pl.x, pl.y);
      ctx.rotate(this.tGlobal * 0.8);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = Math.max(0.1, a) * 0.5;
      const glow = glowSprite(CYAN);
      ctx.drawImage(glow, -34, -34, 68, 68);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = Math.max(0.15, a);
      ctx.strokeStyle = CYAN;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * TAU;
        const x = Math.cos(ang) * 27;
        const y = Math.sin(ang) * 27;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    const blink = pl.inv > 0 && Math.floor(this.tGlobal * 16) % 2 === 0;
    if (blink) return;

    ctx.save();
    ctx.translate(pl.x, pl.y);
    ctx.rotate(pl.aim);

    if (this.thrusting) {
      const fl = 12 + Math.sin(this.tGlobal * 42) * 4 + rand(0, 4);
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "rgba(255,180,0,0.75)";
      ctx.beginPath();
      ctx.moveTo(-8, -4.5);
      ctx.lineTo(-8 - fl, 0);
      ctx.lineTo(-8, 4.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(190,250,255,0.85)";
      ctx.beginPath();
      ctx.moveTo(-8, -2.2);
      ctx.lineTo(-8 - fl * 0.55, 0);
      ctx.lineTo(-8, 2.2);
      ctx.closePath();
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    }

    ctx.beginPath();
    ctx.moveTo(17, 0);
    ctx.lineTo(-12, 11);
    ctx.lineTo(-7, 0);
    ctx.lineTo(-12, -11);
    ctx.closePath();
    ctx.fillStyle = "rgba(2,32,48,0.92)";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = CYAN;
    ctx.stroke();
    ctx.fillStyle = "#eafcff";
    ctx.beginPath();
    ctx.arc(7, 0, 2.3, 0, TAU);
    ctx.fill();

    if (pl.inv > 0) {
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = WHITE;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  private drawPowerups(ctx: CanvasRenderingContext2D) {
    const cols = [AMBER, MAG, CYAN];
    const letters = ["T", "R", "S"];
    for (const p of this.powerups) {
      const c = cols[p.type];
      const fade = p.t > 10 ? clamp(1 - (p.t - 10) / 3, 0, 1) : 1;
      const pulse = 1 + Math.sin(p.t * 5 + p.spin) * 0.09;
      const rot = p.spin + p.t * 1.6;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.globalAlpha = fade;
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = fade * 0.5;
      const glow = glowSprite(c);
      ctx.drawImage(glow, -22, -22, 44, 44);
      ctx.globalAlpha = fade;
      ctx.globalCompositeOperation = "source-over";
      ctx.rotate(rot);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * TAU;
        const x = Math.cos(ang) * 13 * pulse;
        const y = Math.sin(ang) * 13 * pulse;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = "rgba(6,16,32,0.92)";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = c;
      ctx.stroke();
      ctx.rotate(-rot);
      ctx.font = '700 13px "Chakra Petch", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = c;
      ctx.fillText(letters[p.type], 0, 1);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  private drawParticles(ctx: CanvasRenderingContext2D) {
    for (const p of this.particles) {
      const a = clamp(p.life / p.max, 0, 1);
      ctx.globalCompositeOperation = "lighter";
      if (p.kind === 0) {
        ctx.globalAlpha = a;
        const s = p.size * (0.5 + a * 0.5) * 3.2;
        ctx.drawImage(glowSprite(p.color), p.x - s / 2, p.y - s / 2, s, s);
      } else if (p.kind === 1) {
        ctx.globalAlpha = a;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.beginPath();
        ctx.moveTo(-p.size / 2, 0);
        ctx.lineTo(p.size / 2, 0);
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.globalAlpha = a * 0.9;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2.5 * a + 0.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  private drawFloaters(ctx: CanvasRenderingContext2D) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const f of this.floaters) {
      ctx.globalAlpha = clamp(1 - f.t, 0, 1);
      ctx.font = f.big
        ? '700 30px "Orbitron", sans-serif'
        : '700 15px "Chakra Petch", sans-serif';
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillText(f.text, f.x + 1.5, f.y + 1.5);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  private drawReticle(ctx: CanvasRenderingContext2D) {
    const m = this.mouse;
    const wantGo = this.keys.has("KeyW") || this.keys.has("ArrowUp");

    /* filo di aggancio nave ↔ puntatore mentre W è premuto */
    if (this.pl.alive && wantGo) {
      const d = Math.hypot(m.x - this.pl.x, m.y - this.pl.y);
      if (d > 18) {
        ctx.save();
        ctx.strokeStyle = "rgba(255,180,0,0.38)";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 8]);
        ctx.beginPath();
        ctx.moveTo(this.pl.x, this.pl.y);
        ctx.lineTo(m.x, m.y);
        ctx.stroke();
        ctx.restore();
      }
    }

    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(this.tGlobal * 1.5);
    ctx.strokeStyle = "rgba(0,240,255,0.9)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, TAU);
    ctx.stroke();
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * TAU;
      ctx.beginPath();
      ctx.moveTo(Math.cos(ang) * 12, Math.sin(ang) * 12);
      ctx.lineTo(Math.cos(ang) * 17, Math.sin(ang) * 17);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(0,240,255,0.9)";
    ctx.beginPath();
    ctx.arc(0, 0, 1.6, 0, TAU);
    ctx.fill();
    ctx.restore();

    /* anello di aggancio quando si vola verso il puntatore */
    if (wantGo) {
      const rr = 15 + Math.sin(this.tGlobal * 12) * 3;
      ctx.strokeStyle = "rgba(255,180,0,0.55)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(m.x, m.y, rr, 0, TAU);
      ctx.stroke();
    }
  }
}
