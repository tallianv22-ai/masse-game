/**
 * Shot interaction. Tune the feel here — the cue and the gesture
 * code read these values instead of hard-coding them.
 */
export const CUE = {
  /** Invisible tap radius around a ball, in meters. Larger than the ball. */
  selectionRadius: 0.72,
  /** Shaft length when the table has room for it. */
  cueLength: 1.9,
  /** Gap between the cue tip and the ball at rest. */
  tipGap: 0.045,
  /** Shaft center height above the felt, at the tip. */
  cueHeight: 0.1,
  /** How thick the shaft reads. The table is large, so the stick is slightly heavy. */
  cueRadius: 0.04,
  /** Shortest the shaft may be before that aim is blocked by the cushion. */
  minLength: 0.55,
  /** Extra gap between the cue and the inside of the cushion. */
  wallClearance: 0.08,
  /** Preferred cue angle for a normal shot, in degrees. */
  normalElevation: 5,
  /** Extra gap kept between the cue and the rail, in meters. */
  railClearanceMargin: 0.03,
  /** Highest automatic lift used to clear the rail, in degrees. */
  maxClearanceElevation: 84,
  /**
   * When a ball is touching the cushion, the tip has to meet it in the jaw.
   * This is how far, in meters, that meeting may run across the rail before the
   * rest of the cue must be above the wood.
   */
  railJaw: 0.09,
  /**
   * 1 follows the finger around the ball. Lower is slower.
   * Applied to the change in angle, not to a snap.
   */
  aimingSensitivity: 1,
  /** Tangential finger travel, in meters, ignored before the aim updates. */
  aimingDeadzone: 0.1,
  /** Backward travel along the cue before the angle locks and power starts. */
  powerGestureThreshold: 0.16,
  /** Furthest the cue may retract, in meters. Longer pull, same full-power shot. */
  maxPull: 1.61,
  /** Ball speed at no pull. Speed scales up to `maxShotPower` at a full pull. */
  minShotPower: 0,
  /** Ball speed at a full pull. Half a pull is half of this. */
  maxShotPower: 11.7,
  /** How fast the cue travels forward on release, meters per second. */
  strikeSpeed: 14,
  /** How close a finger must be to the back half of the cue to grab it. */
  grabRadius: 0.7,
} as const;
