const BGM_URL = "/bgm.mp3";
const BGM_VOLUME = 0.36;

let bgm: HTMLAudioElement | null = null;
let unlocked = false;
let primed = false;

function ensureBgm(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!bgm) {
    bgm = new Audio(BGM_URL);
    bgm.loop = true;
    bgm.volume = BGM_VOLUME;
    bgm.preload = "auto";
  }
  return bgm;
}

/** 在用户点击后调用，允许战斗时播放背景音乐（只初始化一次） */
export function warmUpBgm(): void {
  const track = ensureBgm();
  if (!track) return;
  unlocked = true;
  if (!primed) {
    track.load();
    primed = true;
  }
}

export function syncBgm(status: "lobby" | "countdown" | "running" | "finished"): void {
  const track = ensureBgm();
  if (!track || !unlocked) return;

  const shouldPlay = status === "countdown" || status === "running";
  if (shouldPlay) {
    if (track.paused) void track.play().catch(() => {});
    return;
  }

  track.pause();
  if (status === "lobby") track.currentTime = 0;
}

export function stopBgm(): void {
  const track = ensureBgm();
  if (!track) return;
  track.pause();
  track.currentTime = 0;
}
