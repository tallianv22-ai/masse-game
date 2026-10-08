/**
 * Dotted shot preview. Development leaves it on.
 * A later practice mode can call setTrajectoryPreviewEnabled.
 */
export const TRAJECTORY = {
  /** Master switch. Off hides the dots without removing the predictor. */
  trajectoryPreviewEnabled: true,
  /** Longest path to draw, in meters, if the ball has not reached the rail or stopped. */
  trajectoryPreviewLength: 18,
  /** Longest time to simulate, in seconds. Long enough for a draw to come back. */
  trajectoryPredictionTime: 6,
  /** Integrator step, in seconds. Match a frame so the curve stays with the live ball. */
  trajectorySimulationStep: 1 / 60,
  /** Distance between dots, in meters. */
  trajectoryDotSpacing: 0.22,
  /** Dot diameter on screen, in pixels. */
  trajectoryDotSize: 8,
  /** Height above the felt so the dots do not flicker in the cloth. */
  trajectoryHeight: 0.05,
} as const;

let previewEnabled: boolean = TRAJECTORY.trajectoryPreviewEnabled;

export function isTrajectoryPreviewEnabled() {
  return previewEnabled;
}

export function setTrajectoryPreviewEnabled(enabled: boolean) {
  previewEnabled = enabled;
}
