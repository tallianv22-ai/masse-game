import { CUE } from "./cue";

/**
 * Massé tuning. Change these to adjust the curve.
 * A centered contact uses the normal shot and ignores this file.
 */
export const MASSE = {
  /** How high the cue butt rises, in degrees. The tip stays on the ball. */
  masseCueElevation: 28,
  /** Farthest the red dot can sit, as a fraction of the ball radius. */
  masseMaxContactOffset: 0.7,
  /** Sidespin at full offset and full power, in radians per second. */
  masseSpinStrength: 28,
  /**
   * How hard side spin pushes sideways, in meters per second squared at full spin.
   * Divided by the ball's speed, so a hard hit runs wider and a soft hit hooks tighter.
   */
  masseCurveStrength: 5.4,
  /**
   * Scales only the spin-induced curve. 1 is the current massé.
   * Does not change shot power, cloth traction, or rail bounces.
   */
  masseArcadeCurveMultiplier: 2.45,
  /**
   * Speed lost per radian of curve. The cloth scrubs the spin, so the ball
   * slows through a bend instead of holding its pace.
   */
  masseCurveDrag: 0.12,
  /** Fastest the heading may turn, in radians per second. Stops a tight orbit. */
  masseMaxYaw: 3.3,
  /** Sidespin is spent after the heading has bent this far, so a hook cannot circle. */
  masseMaxHookTurn: 2.75,
  /**
   * Share of a draw's spin that may come back as reverse speed. The rest is lost.
   * Rollbacks keep less speed than a curve.
   */
  masseRollbackKeep: 0.4,
  /** Seconds for the hook to take. Lower starts the bend sooner. */
  masseCurveDelay: 0.14,
  /** How fast lateral and draw spin fade after the hook takes. Higher straightens sooner. */
  masseSpinDecay: 0.85,
  /** Cloth grip acting on the side spin. Higher bends harder. Same role as `masseLateralGrip`. */
  masseSurfaceGrip: 0.42,
  /** Cloth grip on the side spin. Does not change a shot with no side contact. */
  masseLateralGrip: 0.42,
  /**
   * How hard the cloth grabs draw and follow. 1 matches a normal skid.
   * Higher finishes the grip sooner. It cannot add energy.
   */
  masseLongitudinalGrip: 2.15,
  /** Backspin at a full bottom contact and full power, in radians per second. */
  masseBackspinStrength: 520,
  /** Topspin at a full top contact and full power, in radians per second. */
  masseTopspinStrength: 80,
  /** Extra curve while backspin is still on the ball. 0 leaves side spin unchanged. */
  masseHookbackStrength: 2.1,
  /** Spin, in radians per second, that no longer bends or pulls the ball. */
  masseMinimumSpinThreshold: 2,
  /** How much shot speed increases spin. 0 ignores power, 1 scales it linearly. */
  massePowerInfluence: 0.6,
  /** Curve stops once the ball is slower than this, in m/s. */
  masseMinimumSpeed: 0.5,
  /** Red-dot size and grab radius on screen, in pixels. */
  masseContactTouchRadius: 36,
} as const;

/** Contact on the ball's right curves the shot to its right. */
export function masseSideSpin(contactX: number, speed: number) {
  const side = clamp(contactX / MASSE.masseMaxContactOffset, -1, 1);
  if (Math.abs(side) < 0.02) return 0;
  return side * MASSE.masseSpinStrength * spinPower(speed);
}

/** Positive is follow. Negative is draw. Scales with shot speed. Center returns 0. */
export function masseLongSpin(contactY: number, speed: number) {
  const offset = clamp(contactY / MASSE.masseMaxContactOffset, -1, 1);
  if (Math.abs(offset) < 0.02) return 0;
  const strength = offset > 0 ? MASSE.masseTopspinStrength : MASSE.masseBackspinStrength;
  const fraction = Math.max(speed, 0.001) / CUE.maxShotPower;
  return offset * strength * fraction;
}

function spinPower(speed: number) {
  return Math.pow(Math.max(speed, 0.001) / CUE.maxShotPower, MASSE.massePowerInfluence);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
