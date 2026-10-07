/**
 * Gameplay colliders and the temporary test ball.
 * These do not scale or move the imported table mesh.
 *
 * Felt numbers were measured on the fitted Ogtable: the green surface
 * tops out near y = 1.958 and ends near radius 4.13. Nudge them here
 * if the debug rings do not sit on the cloth.
 */
export const PHYSICS = {
  /** World Y of the felt the ball rests on. */
  surfaceY: 1.958,
  /** Usable green playing surface, meters from the table center. */
  playingRadius: 4.13,
  /** Inside face of the circular cushion. */
  railRadius: 4.13,
  /** How tall the rail collider stands above the felt. */
  railHeight: 0.24,
  /** Thickness of the invisible felt disc. Its top is `surfaceY`. */
  surfaceThickness: 0.08,

  ballRadius: 0.086,
  ballMass: 0.17,
  /** Starting position on the felt, meters from center. Near the middle. */
  ballStartX: 0.2,
  ballStartZ: 0,

  /** Ball against felt. Higher friction grips more and rolls sooner. */
  feltFriction: 0.4,
  feltRestitution: 0,

  /** Ball against the circular rail. Below 1 so a hit loses speed. */
  railRestitution: 0.55,
  railFriction: 0.14,

  /** Gentle damping so a slow ball settles instead of creeping. */
  linearDamping: 0.14,
  angularDamping: 0.08,

  /** Speed given by the temporary launch test, in meters per second. */
  launchSpeed: 5.5,

  gravity: -9.81,

  /** Guide rings for the felt edge and the rail. Not part of the table. */
  debugColliders: true,
} as const;
