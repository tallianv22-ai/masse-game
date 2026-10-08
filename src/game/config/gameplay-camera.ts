import { TABLE } from "./table";

/**
 * Gameplay orbit. The lens always looks at the table center.
 * Elevation is degrees above the horizon: low looks across the cloth,
 * high looks down on it. The camera cannot pan off the table.
 */
export const GAMEPLAY_CAMERA = {
  /** World Y the orbit looks at. X and Z stay on the table center. */
  targetHeight: TABLE.playingSurfaceY,
  /** Lowest tilt, looking across the table. Degrees above the horizon. */
  minElevation: 18,
  /** Highest tilt, looking down at the playing surface. */
  maxElevation: 68,
  /** Closest and farthest orbit radius, in meters. */
  minDistance: 10,
  maxDistance: 20,
  /** The lens stays at least this high, so it cannot enter or go under the table. */
  minHeight: TABLE.playingSurfaceY + 1.2,
  /** Radians per pixel. Distance is the scroll/pinch scale. */
  sensitivity: {
    orbit: 0.0055,
    elevation: 0.0036,
    distance: 0.0011,
  },
} as const;
