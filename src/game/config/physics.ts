/**
 * Gameplay colliders and the temporary test ball.
 * These do not scale or move the imported table mesh.
 *
 * Felt numbers were measured on the fitted Ogtable, then scaled with the
 * table (25% larger). The green surface tops out near y = 2.4475 and ends
 * near radius 5.1625. Nudge them here if the debug rings do not sit on the cloth.
 */
export const PHYSICS = {
  /** World Y of the felt the ball rests on. */
  surfaceY: 2.4475,
  /** Usable green playing surface, meters from the table center. */
  playingRadius: 5.1625,
  /** Inside face of the circular cushion. */
  railRadius: 5.1625,
  /** How tall the rail collider stands above the felt. */
  railHeight: 0.3,
  /** Thickness of the invisible felt disc. Its top is `surfaceY`. */
  surfaceThickness: 0.1,

  ballRadius: 0.086,
  ballMass: 0.17,
  /** Starting position on the felt, meters from center. Near the middle. */
  ballStartX: 0.2,
  ballStartZ: 0,

  /** Ball against felt while it is still skidding. Higher grips and rolls sooner. */
  feltFriction: 0.2,
  feltRestitution: 0,
  /** How fast a rolling ball slows, in m/s², until it stops. */
  rollingDecel: 1.7,
  /** Below this speed the ball is stopped so it does not creep. */
  stopSpeed: 0.12,
  /** Share of pure roll applied at the hit. The rest skids, then grips. */
  strikeRoll: 0.3,

  /** Ball against the circular rail. Below 1 so a hit loses speed. */
  railRestitution: 0.68,
  railFriction: 0.2,
  /** Extra speed removed on each cushion hit, in m/s. */
  railLoss: 0.45,

  /** Left at zero. Felt and rails slow the ball, not this drag. */
  linearDamping: 0,
  angularDamping: 0.04,

  /** Speed given by the temporary launch test, in meters per second. */
  launchSpeed: 5.5,

  gravity: -9.81,

  /** Guide rings for the felt edge and the rail. Not part of the table. */
  debugColliders: true,
} as const;
