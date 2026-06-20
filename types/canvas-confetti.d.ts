declare module "canvas-confetti" {
  export interface ConfettiOptions {
    particleCount?: number;
    spread?: number;
    startVelocity?: number;
    origin?: { x?: number; y?: number };
    colors?: string[];
    scalar?: number;
  }

  export default function confetti(options?: ConfettiOptions): void;
}

