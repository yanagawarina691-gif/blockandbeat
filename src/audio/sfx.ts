export type SfxKind = "cast" | "castEnemy" | "block" | "cancel" | "hit" | "win" | "lose" | "countdown";

type SfxOptions = {
  blockCount?: number;
  damage?: number;
};

let audioCtx: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;
let lastPlayedAt = 0;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  return audioCtx;
}

function ensureNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer) return noiseBuffer;
  const duration = 0.08;
  noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  return noiseBuffer;
}

/** 在用户点击按钮时调用，解锁 iOS / Safari 音频 */
export function warmUpAudio(): void {
  const ctx = getContext();
  if (!ctx) return;
  void ctx.resume();
  playSfx("countdown", undefined, 0.04);
}

export function playSfx(kind: SfxKind, options: SfxOptions = {}, volumeScale = 1): void {
  const ctx = getContext();
  if (!ctx || ctx.state === "suspended") return;

  const now = performance.now();
  if (now - lastPlayedAt < 28 && kind !== "win" && kind !== "lose") return;
  lastPlayedAt = now;

  switch (kind) {
    case "cast":
      playSweep(ctx, 240, 520, 0.1, 0.22 * volumeScale, "square");
      break;
    case "castEnemy":
      playSweep(ctx, 180, 360, 0.09, 0.14 * volumeScale, "square");
      break;
    case "block": {
      const boost = Math.min(options.blockCount ?? 1, 6);
      playNoiseBurst(ctx, 0.055, 0.28 * volumeScale);
      playSweep(ctx, 110 + boost * 18, 70 + boost * 10, 0.12, 0.24 * volumeScale, "triangle");
      break;
    }
    case "cancel":
      playPop(ctx, 420, 0.05, 0.18 * volumeScale);
      window.setTimeout(() => playPop(ctx, 280, 0.04, 0.14 * volumeScale), 45);
      break;
    case "hit": {
      const heavy = Math.min((options.damage ?? 10) / 16, 1.4);
      playNoiseBurst(ctx, 0.08 * heavy, 0.26 * volumeScale);
      playSweep(ctx, 92, 48, 0.14 * heavy, 0.3 * volumeScale, "sawtooth");
      break;
    }
    case "win":
      playPop(ctx, 523, 0.08, 0.2 * volumeScale);
      window.setTimeout(() => playPop(ctx, 659, 0.08, 0.2 * volumeScale), 90);
      window.setTimeout(() => playPop(ctx, 784, 0.12, 0.24 * volumeScale), 180);
      break;
    case "lose":
      playPop(ctx, 392, 0.1, 0.2 * volumeScale);
      window.setTimeout(() => playPop(ctx, 262, 0.14, 0.22 * volumeScale), 120);
      break;
    case "countdown":
      playPop(ctx, 880, 0.04, 0.1 * volumeScale);
      break;
  }
}

function playSweep(
  ctx: AudioContext,
  startHz: number,
  endHz: number,
  duration: number,
  gainPeak: number,
  type: OscillatorType
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const t = ctx.currentTime;
  osc.type = type;
  osc.frequency.setValueAtTime(startHz, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(endHz, 40), t + duration);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(gainPeak, t + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

function playPop(ctx: AudioContext, hz: number, duration: number, gainPeak: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const t = ctx.currentTime;
  osc.type = "square";
  osc.frequency.setValueAtTime(hz, t);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(gainPeak, t + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

function playNoiseBurst(ctx: AudioContext, duration: number, gainPeak: number): void {
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  const t = ctx.currentTime;
  source.buffer = ensureNoiseBuffer(ctx);
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(900, t);
  filter.Q.setValueAtTime(0.7, t);
  gain.gain.setValueAtTime(gainPeak, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start(t);
  source.stop(t + duration + 0.01);
}
