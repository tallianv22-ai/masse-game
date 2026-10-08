import { GAMEPLAY_CAMERA } from "@/game/config/gameplay-camera";
import { TABLE } from "@/game/config/table";
import { pointerRegion } from "@/game/input/pointer-region";
import { isPointerClaimed } from "@/game/input/pointer-claim";
import { MathUtils, PerspectiveCamera, Spherical, Vector3 } from "three";
import { publishCameraPose } from "./camera-pose";

/**
 * Orbit locked to the table center.
 * One finger off the felt turns and tilts. Two fingers also pinch the distance.
 * Touches that grab the ball or the cue are claimed by the shot controls.
 */

const _offset = new Vector3();
const _spherical = new Spherical();
const _target = new Vector3();

const MIN_ELEVATION = MathUtils.degToRad(GAMEPLAY_CAMERA.minElevation);
const MAX_ELEVATION = MathUtils.degToRad(GAMEPLAY_CAMERA.maxElevation);

type Pinch = { dist: number; x: number; y: number };

function pinchOf(points: Map<number, { x: number; y: number }>): Pinch | null {
  const pts = [...points.values()];
  if (pts.length < 2) return null;
  const a = pts[0];
  const b = pts[1];
  return {
    dist: Math.hypot(a.x - b.x, a.y - b.y),
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

export function createGameplayCamera(canvas: HTMLCanvasElement, onChange: () => void) {
  let enabled = false;
  let camera: PerspectiveCamera | null = null;
  let azimuth = 0.6;
  let elevation = MathUtils.degToRad(42);
  let distance = 14;
  let azimuthDelta = 0;
  let elevationDelta = 0;
  let distanceScale = 1;
  let raf = 0;

  const pointers = new Map<number, { x: number; y: number }>();
  let pinch: Pinch | null = null;
  let dragId: number | null = null;
  let lastX = 0;
  let lastY = 0;
  let travel = 0;

  function targetPoint() {
    _target.set(TABLE.centerX, GAMEPLAY_CAMERA.targetHeight, TABLE.centerZ);
    return _target;
  }

  function clampPose() {
    distance = MathUtils.clamp(distance, GAMEPLAY_CAMERA.minDistance, GAMEPLAY_CAMERA.maxDistance);
    let next = MathUtils.clamp(elevation, MIN_ELEVATION, MAX_ELEVATION);
    const rise = GAMEPLAY_CAMERA.minHeight - GAMEPLAY_CAMERA.targetHeight;
    const minSin = rise / Math.max(distance, 0.001);
    if (minSin > 0 && minSin < 1) {
      const floor = Math.asin(minSin);
      if (next < floor) next = Math.min(floor, MAX_ELEVATION);
    }
    elevation = next;
  }

  function place() {
    if (!camera) return;
    clampPose();
    _spherical.radius = distance;
    _spherical.phi = Math.PI / 2 - elevation;
    _spherical.theta = azimuth;
    _spherical.makeSafe();
    _offset.setFromSpherical(_spherical);
    const target = targetPoint();
    camera.position.copy(target).add(_offset);
    if (camera.position.y < GAMEPLAY_CAMERA.minHeight) camera.position.y = GAMEPLAY_CAMERA.minHeight;
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
    camera.updateMatrixWorld();
    publishCameraPose({
      position: [camera.position.x, camera.position.y, camera.position.z],
      target: [target.x, target.y, target.z],
      fov: camera.fov,
    });
  }

  function energy() {
    return (
      Math.abs(azimuthDelta) > 1e-4 ||
      Math.abs(elevationDelta) > 1e-4 ||
      Math.abs(distanceScale - 1) > 1e-4
    );
  }

  function integrate() {
    azimuth += azimuthDelta * 0.45;
    elevation += elevationDelta * 0.45;
    distance *= distanceScale;
    distanceScale = 1;
    clampPose();
    azimuthDelta *= 0.55;
    elevationDelta *= 0.55;
  }

  function kick() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (!enabled) return;
      integrate();
      onChange();
      if (energy()) kick();
    });
  }

  function nudge() {
    if (!enabled) return;
    integrate();
    onChange();
    if (energy()) kick();
  }

  function onPointerDown(event: PointerEvent) {
    if (!enabled || !camera) return;
    if (isPointerClaimed(event.pointerId)) return;
    if ((event.target as HTMLElement).closest("button")) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;

    const region = pointerRegion(event, camera, canvas);
    if (region === "ui") return;

    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    canvas.classList.add("is-looking");
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    if (pointers.size >= 2) {
      dragId = null;
      pinch = pinchOf(pointers);
      travel = 99;
      return;
    }
    dragId = event.pointerId;
    lastX = event.clientX;
    lastY = event.clientY;
    travel = 0;
  }

  function onPointerMove(event: PointerEvent) {
    if (!enabled || isPointerClaimed(event.pointerId)) {
      pointers.delete(event.pointerId);
      return;
    }
    if (!pointers.has(event.pointerId)) return;
    if (event.cancelable) event.preventDefault();
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size >= 2 && pinch) {
      const next = pinchOf(pointers);
      if (!next || pinch.dist < 8) return;
      const dolly = next.dist / pinch.dist;
      if (dolly > 0 && Math.abs(dolly - 1) > 0.001) distanceScale *= pinch.dist / next.dist;
      azimuthDelta -= (next.x - pinch.x) * GAMEPLAY_CAMERA.sensitivity.orbit;
      elevationDelta += (next.y - pinch.y) * GAMEPLAY_CAMERA.sensitivity.elevation;
      pinch = next;
      nudge();
      return;
    }

    if (dragId !== event.pointerId) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    if (dx === 0 && dy === 0) return;
    travel += Math.hypot(dx, dy);
    if (travel < 28) return;
    azimuthDelta -= dx * GAMEPLAY_CAMERA.sensitivity.orbit;
    elevationDelta += dy * GAMEPLAY_CAMERA.sensitivity.elevation;
    nudge();
  }

  function endPointer(event: PointerEvent) {
    pointers.delete(event.pointerId);
    if (!enabled) {
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
      return;
    }
    if (pointers.size === 1) {
      pinch = null;
      const [id, point] = [...pointers.entries()][0];
      dragId = id;
      lastX = point.x;
      lastY = point.y;
      travel = 0;
    } else {
      pinch = null;
      dragId = null;
      canvas.classList.remove("is-looking");
    }
    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
  }

  function onWheel(event: WheelEvent) {
    if (!enabled) return;
    event.preventDefault();
    distanceScale *= Math.exp(event.deltaY * GAMEPLAY_CAMERA.sensitivity.distance);
    nudge();
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove, { passive: false });
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  return {
    setEnabled(next: boolean) {
      if (enabled === next) return;
      enabled = next;
      if (next) return;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      for (const id of pointers.keys()) {
        try {
          canvas.releasePointerCapture(id);
        } catch {
          /* ignore */
        }
      }
      pointers.clear();
      pinch = null;
      dragId = null;
      travel = 0;
      azimuthDelta = 0;
      elevationDelta = 0;
      distanceScale = 1;
      canvas.classList.remove("is-looking");
    },
    engage(next: PerspectiveCamera) {
      camera = next;
      const offset = _offset.copy(next.position).sub(targetPoint());
      if (offset.lengthSq() < 0.25) offset.set(8, 7, 10);
      _spherical.setFromVector3(offset);
      azimuth = _spherical.theta;
      elevation = Math.PI / 2 - _spherical.phi;
      distance = _spherical.radius;
      clampPose();
      place();
    },
    apply(next: PerspectiveCamera) {
      camera = next;
      if (!enabled) return;
      place();
    },
    dispose() {
      if (raf) cancelAnimationFrame(raf);
      canvas.classList.remove("is-looking");
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", endPointer);
      canvas.removeEventListener("pointercancel", endPointer);
      canvas.removeEventListener("wheel", onWheel);
    },
  };
}
