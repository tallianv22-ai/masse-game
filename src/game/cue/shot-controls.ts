import { CUE } from "@/game/config/cue";
import { MASSE, masseSideSpin } from "@/game/config/masse";
import { PHYSICS } from "@/game/config/physics";
import { isTrajectoryPreviewEnabled, TRAJECTORY } from "@/game/config/trajectory";
import {
  isMasseActive,
  isMasseDebug,
  masseContact,
  publishMasseReadout,
  setPreparingShot,
  subscribeMasse,
} from "@/game/cue/masse-session";
import { claimPointer, releasePointer } from "@/game/input/pointer-claim";
import type { createTablePhysics } from "@/game/physics/table-physics";
import { predictShotPath } from "@/game/physics/shot-motion";
import { clearShaftDistance, smoothCueElevation, shaftDistances, shaftPoint } from "@/game/cue/rail-clearance";
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Plane,
  Points,
  PointsMaterial,
  Ray,
  Raycaster,
  RingGeometry,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
  MathUtils,
} from "three";

const _raycaster = new Raycaster();
const _ndc = new Vector2();
const _hit = new Vector3();
const _aimPlane = new Plane(new Vector3(0, 1, 0), -(PHYSICS.surfaceY + PHYSICS.ballRadius));
const _up = new Vector3(0, 1, 0);
const _aim = new Vector3();
const _center = new Vector3();
const _segA = new Vector3();
const _segB = new Vector3();
const _rayDir = new Vector3();
const _segDir = new Vector3();
const _fromA = new Vector3();
const _onRay = new Vector3();
const _onSeg = new Vector3();

type Physics = ReturnType<typeof createTablePhysics>;

type Gesture = {
  id: number;
  kind: "select" | "cue" | "empty";
  x: number;
  y: number;
  radial0: number;
  finger0: number;
  angle0: number;
  mode: "pending" | "aim" | "power";
  lastRadial: number;
  lastAngle: number;
  backAccum: number;
};

/**
 * Tap a ball, drag the back of the cue to aim, pull back, release.
 * The ball keeps the existing physics. This only chooses the strike.
 */
export function createShotControls(
  scene: Scene,
  camera: PerspectiveCamera,
  canvas: HTMLCanvasElement,
  physics: Physics,
  onChange: () => void,
) {
  const cue = new Group();
  cue.name = "Cue";
  cue.visible = false;
  const shaft = new Mesh(
    new CylinderGeometry(CUE.cueRadius, CUE.cueRadius * 0.92, 1, 16),
    new MeshStandardMaterial({ color: "#a56b3c", roughness: 0.46, metalness: 0.04 }),
  );
  shaft.castShadow = true;
  const tip = new Mesh(
    new SphereGeometry(CUE.cueRadius * 0.72, 12, 8),
    new MeshStandardMaterial({ color: "#f3ecdf", roughness: 0.35, metalness: 0.02 }),
  );
  cue.add(shaft, tip);
  scene.add(cue);

  const marker = new Mesh(
    new RingGeometry(PHYSICS.ballRadius * 1.35, PHYSICS.ballRadius * 1.85, 40),
    new MeshBasicMaterial({ color: "#f0d48a", transparent: true, opacity: 0.95, depthTest: false }),
  );
  marker.rotation.x = -Math.PI / 2;
  marker.visible = false;
  marker.renderOrder = 3;
  scene.add(marker);

  const preview = createPreview();
  scene.add(preview);

  let selected = false;
  let angle = 0.4;
  let pull = 0;
  let gesture: Gesture | null = null;
  let striking = false;
  let strikeFrom = 0;
  let strikeElapsed = 0;
  let struck = false;
  let anchorX = 0;
  let anchorZ = 0;
  let raf = 0;
  let elevation: number = CUE.normalElevation;
  let elevFrame = 0;

  function ball() {
    return physics.ballPosition();
  }

  function capture(id: number) {
    try {
      canvas.setPointerCapture(id);
    } catch {
      /* ignore */
    }
  }

  function pointerRay(clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return null;
    _ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    _raycaster.setFromCamera(_ndc, camera);
    return _raycaster.ray;
  }

  function aimPoint(clientX: number, clientY: number) {
    const ray = pointerRay(clientX, clientY);
    if (!ray || !ray.intersectPlane(_aimPlane, _hit)) return null;
    return { x: _hit.x, z: _hit.z };
  }

  function back(theta: number) {
    return { x: Math.sin(theta), z: Math.cos(theta) };
  }

  function maxPull() {
    return CUE.maxPull;
  }

  function visibleShaft(
    spot: { x: number; z: number },
    dir: { x: number; z: number },
    retracted: number,
    degrees: number,
  ) {
    const { tip, butt } = shaftDistances(retracted);
    const room = clearShaftDistance(spot.x, spot.z, dir.x, dir.z, retracted, degrees);
    const end = Math.min(butt, room);
    return { tip, butt: Math.max(tip, end) };
  }

  function cueSpot() {
    return striking ? { x: anchorX, z: anchorZ } : ball();
  }

  function targetElevation() {
    const spot = cueSpot();
    const dir = back(angle);
    const retracted = Math.max(-CUE.tipGap, pull);
    const preferred = isMasseActive() ? MASSE.masseCueElevation : CUE.normalElevation;
    return smoothCueElevation(spot.x, spot.z, dir.x, dir.z, retracted, preferred);
  }

  function followElevation() {
    elevation = targetElevation();
  }

  function selectAt(theta: number) {
    selected = true;
    angle = theta;
    pull = 0;
    striking = false;
    physics.setTargeted(true);
    setPreparingShot(true);
    onChange();
  }

  function clearSelection() {
    selected = false;
    pull = 0;
    striking = false;
    cue.visible = false;
    marker.visible = false;
    physics.setTargeted(false);
    setPreparingShot(false);
    onChange();
  }

  function cameraSideAngle() {
    const spot = ball();
    const dx = spot.x - camera.position.x;
    const dz = spot.z - camera.position.z;
    if (dx * dx + dz * dz < 1e-4) return 0.4;
    return Math.atan2(-dx, -dz);
  }

  function hitsBall(ray: Ray) {
    const spot = ball();
    _center.set(spot.x, PHYSICS.surfaceY + PHYSICS.ballRadius, spot.z);
    const along = _center.clone().sub(ray.origin).dot(ray.direction);
    if (along < 0) return false;
    return ray.distanceToPoint(_center) <= CUE.selectionRadius;
  }

  function hitsCueBack(ray: Ray) {
    if (!selected || striking) return false;
    const spot = ball();
    const dir = back(angle);
    const { tip, butt } = visibleShaft(spot, dir, pull, elevation);
    const mid = (tip + butt) * 0.5;
    const at = (along: number) => shaftPoint(spot.x, spot.z, dir.x, dir.z, along, elevation);
    const middle = at(mid);
    const rear = at(butt);
    _segA.set(middle.x, PHYSICS.surfaceY + middle.yAbove, middle.z);
    _segB.set(rear.x, PHYSICS.surfaceY + rear.yAbove, rear.z);
    return raySegmentDistance(ray, _segA, _segB) <= CUE.grabRadius;
  }

  function onPointerDown(event: PointerEvent) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if ((event.target as HTMLElement).closest?.("button, [data-touch='ui']")) return;
    if (striking || gesture) return;
    const ray = pointerRay(event.clientX, event.clientY);
    const point = aimPoint(event.clientX, event.clientY);
    if (!ray || !point) {
      gesture = emptyGesture(event);
      return;
    }
    if (hitsCueBack(ray)) {
      claimPointer(event.pointerId);
      event.preventDefault();
      event.stopImmediatePropagation();
      const spot = ball();
      const radial0 = Math.hypot(point.x - spot.x, point.z - spot.z);
      const finger0 = Math.atan2(point.x - spot.x, point.z - spot.z);
      gesture = {
        id: event.pointerId,
        kind: "cue",
        x: event.clientX,
        y: event.clientY,
        radial0,
        finger0,
        angle0: angle,
        mode: "pending",
        lastRadial: radial0,
        lastAngle: finger0,
        backAccum: 0,
      };
      capture(event.pointerId);
      return;
    }
    if (hitsBall(ray)) {
      claimPointer(event.pointerId);
      event.preventDefault();
      event.stopImmediatePropagation();
      selectAt(selected ? angle : cameraSideAngle());
      gesture = {
        id: event.pointerId,
        kind: "select",
        x: event.clientX,
        y: event.clientY,
        radial0: 0,
        finger0: 0,
        angle0: angle,
        mode: "pending",
        lastRadial: 0,
        lastAngle: 0,
        backAccum: 0,
      };
      capture(event.pointerId);
      return;
    }
    gesture = emptyGesture(event);
  }

  function onPointerMove(event: PointerEvent) {
    if (!gesture || gesture.id !== event.pointerId || gesture.kind !== "cue") return;
    if (event.cancelable) event.preventDefault();
    const point = aimPoint(event.clientX, event.clientY);
    if (!point) return;
    const spot = ball();
    const relX = point.x - spot.x;
    const relZ = point.z - spot.z;
    const radial = Math.hypot(relX, relZ);
    if (radial < 1e-4) return;
    const fingerAngle = Math.atan2(relX, relZ);

    if (gesture.mode === "power") {
      pull = Math.min(Math.max(0, radial - gesture.radial0), maxPull());
      onChange();
      return;
    }

    const stepBack = radial - gesture.lastRadial;
    const stepTang = Math.abs(wrap(fingerAngle - gesture.lastAngle)) * Math.max(radial, 0.25);
    gesture.lastRadial = radial;
    gesture.lastAngle = fingerAngle;
    if (stepBack > stepTang) gesture.backAccum += stepBack;
    else gesture.backAccum = 0;

    const swung = Math.abs(wrap(fingerAngle - gesture.finger0)) * Math.max(radial, 0.25);
    const pulling =
      gesture.backAccum > CUE.powerGestureThreshold && gesture.backAccum > stepTang;

    if (pulling) {
      gesture.mode = "power";
      gesture.radial0 = radial - gesture.backAccum;
      pull = Math.min(gesture.backAccum, maxPull());
    } else if (swung > CUE.aimingDeadzone) {
      gesture.mode = "aim";
      angle = wrap(gesture.angle0 + wrap(fingerAngle - gesture.finger0) * CUE.aimingSensitivity);
    }
    onChange();
  }

  function onPointerUp(event: PointerEvent) {
    finishPointer(event, false);
  }

  function onPointerCancel(event: PointerEvent) {
    finishPointer(event, true);
  }

  function finishPointer(event: PointerEvent, cancelled: boolean) {
    if (!gesture || gesture.id !== event.pointerId) return;
    const current = gesture;
    const moved = Math.hypot(event.clientX - current.x, event.clientY - current.y);
    gesture = null;
    releasePointer(event.pointerId);
    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    if (cancelled) {
      pull = 0;
      onChange();
      return;
    }
    if (current.kind === "empty" && moved < 22 && selected && !striking && current.mode !== "power") {
      clearSelection();
      return;
    }
    if (current.kind === "cue") {
      if (current.mode === "power" && pull >= CUE.powerGestureThreshold) beginStrike();
      else {
        pull = 0;
        onChange();
      }
    }
  }

  function beginStrike() {
    striking = true;
    const shotContact = isMasseActive() ? { ...masseContact() } : null;
    setPreparingShot(false);
    const spot = ball();
    anchorX = spot.x;
    anchorZ = spot.z;
    strikeFrom = pull;
    strikeElapsed = 0;
    struck = false;
    const start = performance.now();
    let last = start;
    const step = (now: number) => {
      raf = 0;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      strikeElapsed += dt;
      pull = strikeFrom - CUE.strikeSpeed * strikeElapsed;
      if (!struck && pull <= 0) {
        struck = true;
        const dir = back(angle);
        const speed = shotPower(strikeFrom);
        physics.strike(-dir.x, -dir.z, speed, shotContact);
      }
      onChange();
      if (pull > -0.22) {
        raf = requestAnimationFrame(step);
        return;
      }
      clearSelection();
    };
    raf = requestAnimationFrame(step);
  }

  function present() {
    const live = ball();
    const spot = cueSpot();
    marker.visible = selected && !striking;
    marker.position.set(live.x, PHYSICS.surfaceY + 0.012, live.z);
    if (!selected) {
      cue.visible = false;
      preview.visible = false;
      return;
    }
    followElevation();
    const dir = back(angle);
    const retracted = Math.max(-CUE.tipGap, pull);
    const { tip: tipAlong, butt } = visibleShaft(spot, dir, retracted, elevation);
    const rear = shaftPoint(spot.x, spot.z, dir.x, dir.z, butt, elevation);
    const nose = shaftPoint(spot.x, spot.z, dir.x, dir.z, tipAlong, elevation);
    const shaftLen = Math.max(0.04, butt - tipAlong);
    shaft.scale.y = shaftLen;
    shaft.position.y = shaftLen * 0.5;
    tip.position.y = shaftLen;
    _aim.set(nose.x - rear.x, nose.yAbove - rear.yAbove, nose.z - rear.z);
    if (_aim.lengthSq() > 0) cue.quaternion.setFromUnitVectors(_up, _aim.normalize());
    cue.position.set(rear.x, PHYSICS.surfaceY + rear.yAbove, rear.z);
    cue.visible = true;
    updatePreview(dir.x, dir.z);
    if (isMasseDebug()) {
      const shot = shotPower(pull);
      const contact = masseContact();
      publishMasseReadout({
        contactX: contact.x,
        contactY: contact.y,
        power: shot,
        spin: isMasseActive() ? masseSideSpin(contact.x, Math.max(shot, 0.001)) : 0,
        active: isMasseActive(),
      });
    }
  }

  function updatePreview(backX: number, backZ: number) {
    const show =
      isTrajectoryPreviewEnabled() &&
      selected &&
      !striking &&
      gesture?.mode === "power" &&
      pull > 0.02;
    if (!show) {
      preview.visible = false;
      return;
    }
    const spot = ball();
    const path = predictShotPath(
      spot.x,
      spot.z,
      -backX,
      -backZ,
      shotPower(pull),
      isMasseActive() ? masseContact() : null,
    );
    const attribute = preview.geometry.getAttribute("position") as BufferAttribute;
    const positions = attribute.array as Float32Array;
    const gap = PHYSICS.ballRadius * 2.4;
    let distance = 0;
    let nextDot = gap;
    let count = 0;
    const max = positions.length / 3;
    const y = PHYSICS.surfaceY + TRAJECTORY.trajectoryHeight;
    for (let i = 1; i < path.length && count < max; i += 1) {
      const from = path[i - 1];
      const to = path[i];
      const span = Math.hypot(to.x - from.x, to.z - from.z);
      if (span < 1e-6) continue;
      while (nextDot <= distance + span && count < max) {
        const t = (nextDot - distance) / span;
        const index = count * 3;
        positions[index] = from.x + (to.x - from.x) * t;
        positions[index + 1] = y;
        positions[index + 2] = from.z + (to.z - from.z) * t;
        count += 1;
        nextDot += TRAJECTORY.trajectoryDotSpacing;
      }
      distance += span;
    }
    attribute.needsUpdate = true;
    preview.geometry.setDrawRange(0, count);
    preview.visible = count > 1;
  }

  function shotPower(amount: number) {
    const t = Math.min(1, Math.max(0, amount) / Math.max(CUE.maxPull, 0.001));
    return CUE.minShotPower + (CUE.maxShotPower - CUE.minShotPower) * t;
  }

  canvas.addEventListener("pointerdown", onPointerDown, true);
  canvas.addEventListener("pointermove", onPointerMove, { capture: true, passive: false });
  canvas.addEventListener("pointerup", onPointerUp, true);
  canvas.addEventListener("pointercancel", onPointerCancel, true);
  const unsubscribe = subscribeMasse(() => {
    const contact = masseContact();
    const active = isMasseActive();
    if (contact.x !== seenContactX || contact.y !== seenContactY || active !== seenMasse) {
      seenContactX = contact.x;
      seenContactY = contact.y;
      seenMasse = active;
      onChange();
    }
    followElevation();
  });
  let seenContactX = 0;
  let seenContactY = 0;
  let seenMasse = false;

  return {
    present,
    dispose() {
      if (raf) cancelAnimationFrame(raf);
      if (elevFrame) cancelAnimationFrame(elevFrame);
      unsubscribe();
      setPreparingShot(false);
      canvas.removeEventListener("pointerdown", onPointerDown, true);
      canvas.removeEventListener("pointermove", onPointerMove, true);
      canvas.removeEventListener("pointerup", onPointerUp, true);
      canvas.removeEventListener("pointercancel", onPointerCancel, true);
      scene.remove(cue);
      scene.remove(marker);
      scene.remove(preview);
      preview.geometry.dispose();
      (preview.material as PointsMaterial).map?.dispose();
      (preview.material as PointsMaterial).dispose();
      physics.setTargeted(false);
    },
  };
}

function createPreview() {
  const maxDots = Math.min(
    400,
    Math.ceil(TRAJECTORY.trajectoryPreviewLength / TRAJECTORY.trajectoryDotSpacing) + 2,
  );
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(maxDots * 3), 3));
  geometry.setDrawRange(0, 0);
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "#fff6e8";
    context.beginPath();
    context.arc(16, 16, 13, 0, Math.PI * 2);
    context.fill();
  }
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  const dots = new Points(
    geometry,
    new PointsMaterial({
      map,
      color: "#fff6e8",
      size: TRAJECTORY.trajectoryDotSize,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      alphaTest: 0.4,
    }),
  );
  dots.name = "ShotPreview";
  dots.frustumCulled = false;
  dots.renderOrder = 6;
  dots.visible = false;
  return dots;
}

function emptyGesture(event: PointerEvent): Gesture {
  return {
    id: event.pointerId,
    kind: "empty",
    x: event.clientX,
    y: event.clientY,
    radial0: 0,
    finger0: 0,
    angle0: 0,
    mode: "pending",
    lastRadial: 0,
    lastAngle: 0,
    backAccum: 0,
  };
}

function wrap(value: number) {
  const turn = Math.PI * 2;
  return ((value + Math.PI) % turn + turn) % turn - Math.PI;
}

function raySegmentDistance(ray: Ray, a: Vector3, b: Vector3) {
  _rayDir.copy(ray.direction);
  _segDir.copy(b).sub(a);
  _fromA.copy(ray.origin).sub(a);
  const bDot = _rayDir.dot(_segDir);
  const cDot = _segDir.dot(_segDir);
  const dDot = _rayDir.dot(_fromA);
  const eDot = _segDir.dot(_fromA);
  const denom = cDot - bDot * bDot;
  let alongRay = 0;
  let alongSeg = 0;
  if (denom > 1e-8) {
    alongRay = (bDot * eDot - cDot * dDot) / denom;
    alongSeg = (eDot - bDot * dDot) / denom;
  }
  if (alongRay < 0) alongRay = 0;
  alongSeg = Math.min(1, Math.max(0, alongSeg));
  _onRay.copy(ray.origin).addScaledVector(_rayDir, alongRay);
  _onSeg.copy(a).addScaledVector(_segDir, alongSeg);
  return _onRay.distanceTo(_onSeg);
}
