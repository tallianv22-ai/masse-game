import { useSyncExternalStore } from "react";

/** Inspection is the default so the opening view stays unchanged. */
export type CameraMode = "development" | "gameplay";

let mode: CameraMode = "development";
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function getCameraMode() {
  return mode;
}

export function setCameraMode(next: CameraMode) {
  if (mode === next) return;
  mode = next;
  emit();
}

export function toggleCameraMode() {
  setCameraMode(mode === "development" ? "gameplay" : "development");
}

export function subscribeCameraMode(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCameraMode() {
  return useSyncExternalStore(subscribeCameraMode, getCameraMode, () => "development" as const);
}
