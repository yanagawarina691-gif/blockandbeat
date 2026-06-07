import type { MatchState, PlayerId } from "../shared/types";

interface GameBridge {
  getState: () => MatchState | null;
  getLocalPlayerId: () => PlayerId;
  blockFlashUntil: number;
  triggerBlockFlash: () => void;
}

export const gameBridge: GameBridge = {
  getState: () => null,
  getLocalPlayerId: () => "p1",
  blockFlashUntil: 0,
  triggerBlockFlash: () => {
    gameBridge.blockFlashUntil = performance.now() + 520;
  }
};
