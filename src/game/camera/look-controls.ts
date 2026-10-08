import { CAMERA } from "@/game/config/camera";
import { ROOM_LAYOUT } from "@/game/config/room";
import { isPointerClaimed } from "@/game/input/pointer-claim";
import { MathUtils, PerspectiveCamera, Spherical, Vector3 } from "three";
import { publishCameraPose } from "./camera-pose";

/**
 * One finger slides the room, stuck to the finger.
 * Two fingers tilt, turn, and pinch-zoom together.
 * The view eases with the finger, then settles. It does not flick.
 */

const PHI_MIN = 0.28;
const PHI_MAX = 1.48;
const RADIUS_MIN = 6.5;
const RADIUS_MAX = 28;

const spherical = new Spherical();
const sphericalDelta = new Spherical();
const target = new Vector3();
const panOffset = new Vector3();
const _offset = new Vector3();
const _axis = new Vector3();

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

export function createLookControls(canvas: HTMLCanvasElement, onChange: () => void) {
  let ready = false;
  let enabled = true;
  let moved = false;
  let scale = 1;
  let raf = 0;
  let camera: PerspectiveCamera | null = null;
  let pendingX = 0;
  let pendingY = 0;

  const pointers = new Map<number, { x: number; y: number }>();
  let pinch: Pinch | null = null;
  let dragId: number | null = null;
  let dragTurns = false;
  let lastX = 0;
  let lastY = 0;
  let travel = 0;

  const held = { left: false, right: false, up: false, down: false };

  function setBasis(next: PerspectiveCamera) {
    camera = next;
    target.set(CAMERA.target[0], CAMERA.target[1], CAMERA.target[2]);
    spherical.setFromVector3(_offset.copy(next.position).sub(target));
    sphericalDelta.set(0, 0, 0);
    panOffset.set(0, 0, 0);
    pendingX = 0;
    pendingY = 0;
    scale = 1;
    ready = true;
  }

  function clampTarget() {
    const margin = 1.4;
    const limitX = ROOM_LAYOUT.innerWidth / 2 - margin;
    const limitZ = ROOM_LAYOUT.innerDepth / 2 - margin;
    const x = MathUtils.clamp(target.x, -limitX, limitX);
    const y = MathUtils.clamp(target.y, 0.2, ROOM_LAYOUT.height - 0.7);
    const z = MathUtils.clamp(target.z, -limitZ, limitZ);
    if (x !== target.x) panOffset.x = 0;
    if (y !== target.y) panOffset.y = 0;
    if (z !== target.z) panOffset.z = 0;
    target.set(x, y, z);
  }

  function place() {
    if (!camera) return;
    _offset.setFromSpherical(spherical);
    camera.position.copy(target).add(_offset);
    const margin = 0.85;
    const limitX = ROOM_LAYOUT.innerWidth / 2 - margin;
    const limitZ = ROOM_LAYOUT.innerDepth / 2 - margin;
    camera.position.x = MathUtils.clamp(camera.position.x, -limitX, limitX);
    camera.position.z = MathUtils.clamp(camera.position.z, -limitZ, limitZ);
    camera.position.y = MathUtils.clamp(camera.position.y, 0.35, ROOM_LAYOUT.height - 0.3);
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
    camera.updateMatrixWorld();
    publishCameraPose({
      position: [camera.position.x, camera.position.y, camera.position.z],
      target: [target.x, target.y, target.z],
      fov: camera.fov,
    });
  }

  function flushPan() {
    if (!camera || (pendingX === 0 && pendingY === 0)) return;
    _offset.copy(camera.position).sub(target);
    const dist = _offset.length() * Math.tan((camera.fov / 2) * Math.PI / 180);
    const height = Math.max(canvas.clientHeight, 1);
    const panX = (2 * pendingX * dist) / height;
    const panY = (2 * pendingY * dist) / height;
    _axis.setFromMatrixColumn(camera.matrix, 0).multiplyScalar(-panX);
    panOffset.add(_axis);
    _axis.setFromMatrixColumn(camera.matrix, 1).multiplyScalar(panY);
    panOffset.add(_axis);
    pendingX = 0;
    pendingY = 0;
  }

  function energy() {
    return (
      Math.abs(sphericalDelta.theta) > 1e-4 ||
      Math.abs(sphericalDelta.phi) > 1e-4 ||
      panOffset.lengthSq() > 1e-6 ||
      pendingX !== 0 ||
      pendingY !== 0 ||
      Math.abs(scale - 1) > 1e-4 ||
      held.left ||
      held.right ||
      held.up ||
      held.down
    );
  }

  function integrate() {
    flushPan();
    if (held.left) sphericalDelta.theta += 0.012;
    if (held.right) sphericalDelta.theta -= 0.012;
    if (held.up) sphericalDelta.phi -= 0.008;
    if (held.down) sphericalDelta.phi += 0.008;

    spherical.theta += sphericalDelta.theta * 0.42;
    spherical.phi += sphericalDelta.phi * 0.42;
    const phi = MathUtils.clamp(spherical.phi, PHI_MIN, PHI_MAX);
    if (phi !== spherical.phi) sphericalDelta.phi = 0;
    spherical.phi = phi;
    spherical.makeSafe();

    target.add(panOffset);
    panOffset.set(0, 0, 0);
    clampTarget();

    const nextRadius = MathUtils.clamp(spherical.radius * scale, RADIUS_MIN, RADIUS_MAX);
    if (nextRadius === RADIUS_MIN || nextRadius === RADIUS_MAX) scale = 1;
    spherical.radius = nextRadius;
    scale = 1;

    sphericalDelta.theta *= 0.58;
    sphericalDelta.phi *= 0.58;
  }

  function kick() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (!ready) return;
      integrate();
      moved = true;
      onChange();
      if (energy()) kick();
    });
  }

  function nudge() {
    if (!ready) return;
    integrate();
    moved = true;
    onChange();
    if (energy()) kick();
  }

  function turn(dx: number, dy: number) {
    const height = Math.max(canvas.clientHeight, 1);
    const speed = (Math.PI * 1.15) / height;
    sphericalDelta.theta -= dx * speed;
    sphericalDelta.phi -= dy * speed;
  }

  function onPointerDown(event: PointerEvent) {
    if (!enabled || !ready) return;
    if (isPointerClaimed(event.pointerId)) return;
    if ((event.target as HTMLElement).closest("button")) return;
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
    dragTurns = event.button === 2;
    lastX = event.clientX;
    lastY = event.clientY;
    travel = 0;
  }

  function onPointerMove(event: PointerEvent) {
    if (!enabled || isPointerClaimed(event.pointerId)) {
      pointers.delete(event.pointerId);
      return;
    }
    if (!ready || !pointers.has(event.pointerId)) return;
    if (event.cancelable) event.preventDefault();
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size >= 2 && pinch) {
      const next = pinchOf(pointers);
      if (!next || pinch.dist < 8) return;
      const dolly = next.dist / pinch.dist;
      if (dolly > 0 && Math.abs(dolly - 1) > 0.001) scale /= dolly;
      turn(next.x - pinch.x, next.y - pinch.y);
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
    if (travel < 28 && !dragTurns) return;
    if (dragTurns) turn(dx, dy);
    else {
      pendingX += dx;
      pendingY += dy;
    }
    nudge();
  }

  function onPointerUp(event: PointerEvent) {
    if (!enabled) {
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
      return;
    }
    pointers.delete(event.pointerId);
    if (pointers.size === 1) {
      pinch = null;
      const [id, point] = [...pointers.entries()][0];
      dragId = id;
      dragTurns = false;
      lastX = point.x;
      lastY = point.y;
      travel = 0;
    } else {
      pinch = null;
      dragId = null;
      dragTurns = false;
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
    scale *= Math.exp(event.deltaY * 0.0011);
    nudge();
  }

  function onContextMenu(event: Event) {
    event.preventDefault();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (!enabled) return;
    if (event.repeat) return;
    if (event.key === "ArrowLeft") held.left = true;
    else if (event.key === "ArrowRight") held.right = true;
    else if (event.key === "ArrowUp") held.up = true;
    else if (event.key === "ArrowDown") held.down = true;
    else return;
    event.preventDefault();
    nudge();
  }

  function onKeyUp(event: KeyboardEvent) {
    if (!enabled) return;
    if (event.key === "ArrowLeft") held.left = false;
    else if (event.key === "ArrowRight") held.right = false;
    else if (event.key === "ArrowUp") held.up = false;
    else if (event.key === "ArrowDown") held.down = false;
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove, { passive: false });
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("contextmenu", onContextMenu);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  return {
    hasMoved: () => moved,
    setBasis,
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
      dragTurns = false;
      travel = 0;
      pendingX = 0;
      pendingY = 0;
      sphericalDelta.set(0, 0, 0);
      panOffset.set(0, 0, 0);
      scale = 1;
      held.left = false;
      held.right = false;
      held.up = false;
      held.down = false;
      canvas.classList.remove("is-looking");
    },
    apply(next: PerspectiveCamera) {
      camera = next;
      if (!ready) return;
      place();
    },
    dispose() {
      if (raf) cancelAnimationFrame(raf);
      canvas.classList.remove("is-looking");
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    },
  };
}
