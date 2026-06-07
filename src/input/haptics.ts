type VibrateCapableNavigator = Navigator & {
  vibrate?: (pattern: number | number[]) => boolean;
};

function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** 在用户点击「启体感」等手势里调用，顺便验证本机是否能震 */
export function warmUpHaptics(): void {
  if (typeof window === "undefined") return;
  pulseBlockHaptic(1);
}

export function isHapticSupported(): boolean {
  if (typeof window === "undefined") return false;
  if (isIosDevice()) return true;
  return "vibrate" in navigator;
}

export function pulseBlockHaptic(blockCount = 1): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  if (isIosDevice()) {
    fireIosSwitchHaptic(blockCount);
    return;
  }

  const nav = navigator as VibrateCapableNavigator;
  if (typeof nav.vibrate !== "function") return;

  const pulse = 22 + Math.min(blockCount, 8) * 8;
  const gap = 30 + Math.min(blockCount, 6) * 5;
  nav.vibrate([pulse, gap, pulse + 14, gap, pulse + 32]);
}

function fireIosSwitchHaptic(blockCount: number): void {
  const taps = blockCount >= 4 ? 3 : blockCount >= 2 ? 2 : 1;
  for (let i = 0; i < taps; i += 1) {
    triggerIosSwitchTap(i * 110);
  }
}

function triggerIosSwitchTap(delayMs = 0): void {
  const run = (): void => {
    try {
      const label = document.createElement("label");
      label.ariaHidden = "true";
      label.style.display = "none";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("switch", "");

      label.appendChild(input);
      document.head.appendChild(label);
      label.click();
      document.head.removeChild(label);
    } catch {
      // 静默失败
    }
  };

  if (delayMs > 0) window.setTimeout(run, delayMs);
  else run();
}
