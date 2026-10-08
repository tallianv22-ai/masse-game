import { PHYSICS } from "@/game/config/physics";
import { TABLE } from "@/game/config/table";
import { PerspectiveCamera, Plane, Raycaster, Vector2, Vector3 } from "three";

/**
 * Where a touch lands. Camera gestures and future cue gestures
 * claim different regions so one system does not take every touch.
 * `table` is the felt. That is reserved for the cue later.
 */
export type PointerRegion = "ui" | "table" | "camera";

const _ray = new Raycaster();
const _ndc = new Vector2();
const _hit = new Vector3();
const _plane = new Plane(new Vector3(0, 1, 0), -PHYSICS.surfaceY);

export function pointerRegion(
  event: { clientX: number; clientY: number; target: EventTarget | null },
  camera: PerspectiveCamera,
  canvas: HTMLCanvasElement,
): PointerRegion {
  const element = event.target as HTMLElement | null;
  if (element?.closest?.("button, a, input, textarea, [data-touch='ui']")) return "ui";

  const rect = canvas.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return "camera";
  _ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  _ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  _ray.setFromCamera(_ndc, camera);
  if (!_ray.ray.intersectPlane(_plane, _hit)) return "camera";
  const x = _hit.x - TABLE.centerX;
  const z = _hit.z - TABLE.centerZ;
  if (Math.hypot(x, z) <= PHYSICS.playingRadius) return "table";
  return "camera";
}
