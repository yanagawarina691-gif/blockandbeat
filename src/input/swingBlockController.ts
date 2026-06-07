type MotionPermissionEvent = {
  requestPermission?: () => Promise<PermissionState>;
};

type AccelVector = { x: number; y: number; z: number };

const SWING_JERK_THRESHOLD = 26;
const SWING_WINDOW_MS = 130;
const SWING_COOLDOWN_MS = 720;

export function swingSupportMessage(): string {
  if (!isSwingSupported()) return "当前设备不支持挥动检测";
  if (!window.isSecureContext) return "Safari 需用 https 打开才能挥动格挡";
  return "开战后点「启体感」测试震动，挥动格挡成功会再震一下";
}

export function isSwingSupported(): boolean {
  return typeof window !== "undefined" && "DeviceMotionEvent" in window;
}

async function requestMotionPermission(): Promise<boolean> {
  const orientationEvent = DeviceOrientationEvent as typeof DeviceOrientationEvent & MotionPermissionEvent;
  const motionEvent = DeviceMotionEvent as typeof DeviceMotionEvent & MotionPermissionEvent;

  try {
    if (typeof orientationEvent.requestPermission === "function") {
      const result = await orientationEvent.requestPermission();
      if (result !== "granted") return false;
    }
    if (typeof motionEvent.requestPermission === "function") {
      const result = await motionEvent.requestPermission();
      if (result !== "granted") return false;
    }
    return true;
  } catch {
    return false;
  }
}

export class SwingBlockController {
  private listening = false;
  private lastAccel: AccelVector = { x: 0, y: 0, z: 0 };
  private lastSampleAt = 0;
  private swingEnergy = 0;
  private windowStart = 0;
  private lastSwingAt = 0;
  private swingListeners = new Set<() => void>();
  private statusListeners = new Set<(status: string) => void>();
  private motionHandler = (event: DeviceMotionEvent) => this.handleMotion(event);

  get supported(): boolean {
    return isSwingSupported();
  }

  isActive(): boolean {
    return this.listening;
  }

  onSwing(listener: () => void): () => void {
    this.swingListeners.add(listener);
    return () => this.swingListeners.delete(listener);
  }

  onStatus(listener: (status: string) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  async start(): Promise<boolean> {
    if (this.listening) return true;
    if (!this.supported) {
      this.emitStatus(swingSupportMessage());
      return false;
    }
    if (!window.isSecureContext) {
      this.emitStatus("请用 https://电脑IP:5173 打开");
      return false;
    }

    const permitted = await requestMotionPermission();
    if (!permitted) {
      this.emitStatus("请允许动作与方向传感器权限");
      return false;
    }

    window.addEventListener("devicemotion", this.motionHandler);
    this.listening = true;
    this.resetSwingWindow();
    this.emitStatus("挥动检测已开启，敌方技能飞来时挥手机格挡");
    return true;
  }

  stop(): void {
    if (!this.listening) return;
    this.listening = false;
    window.removeEventListener("devicemotion", this.motionHandler);
    this.emitStatus("挥动检测已关闭");
  }

  private resetSwingWindow(): void {
    this.swingEnergy = 0;
    this.windowStart = performance.now();
  }

  private handleMotion(event: DeviceMotionEvent): void {
    const accel = event.accelerationIncludingGravity;
    if (!accel || !this.listening) return;

    const now = performance.now();
    const current = { x: accel.x ?? 0, y: accel.y ?? 0, z: accel.z ?? 0 };

    if (this.lastSampleAt > 0) {
      if (now - this.windowStart > SWING_WINDOW_MS) {
        this.resetSwingWindow();
      }

      const jerk = Math.hypot(
        current.x - this.lastAccel.x,
        current.y - this.lastAccel.y,
        current.z - this.lastAccel.z
      );
      this.swingEnergy += jerk;

      if (this.swingEnergy >= SWING_JERK_THRESHOLD && now - this.lastSwingAt >= SWING_COOLDOWN_MS) {
        this.lastSwingAt = now;
        this.resetSwingWindow();
        for (const listener of this.swingListeners) listener();
      }
    }

    this.lastAccel = current;
    this.lastSampleAt = now;
  }

  private emitStatus(status: string): void {
    for (const listener of this.statusListeners) listener(status);
  }
}
