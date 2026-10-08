import { MASSE, masseLongSpin, masseSideSpin } from "@/game/config/masse";
import { PHYSICS } from "@/game/config/physics";
import { TABLE } from "@/game/config/table";
import { TRAJECTORY } from "@/game/config/trajectory";

/**
 * Horizontal roll and massé curve.
 * The live ball and the dotted preview both step this, so they share one path.
 */
export type HorizontalMotion = {
  vx: number;
  vz: number;
  wx: number;
  wz: number;
  wy: number;
  masseSpin: number;
  /** Extra follow (positive) or draw (negative), in radians per second. */
  longSpin: number;
  /** Heading change since the strike, in radians. Sidespin is used up by the bend. */
  turned: number;
  /** Seconds since the massé spin was applied. */
  masseAge: number;
};

export type ShotContact = { x: number; y: number } | null;

export function strikeMotion(
  dirX: number,
  dirZ: number,
  speed: number,
  contact: ShotContact,
): HorizontalMotion {
  const length = Math.hypot(dirX, dirZ);
  const nx = dirX / length;
  const nz = dirZ / length;
  const roll = PHYSICS.strikeRoll / PHYSICS.ballRadius;
  const longSpin = contact ? masseLongSpin(contact.y, speed) : 0;
  const side = contact ? masseSideSpin(contact.x, speed) : 0;
  return {
    vx: nx * speed,
    vz: nz * speed,
    wx: nz * (speed * roll + longSpin),
    wz: -nx * (speed * roll + longSpin),
    wy: side,
    masseSpin: side,
    longSpin,
    turned: 0,
    masseAge: 0,
  };
}

/** One felt step, then the massé bend. Mutates `motion`. Does not move position. */
export function advanceHorizontalMotion(motion: HorizontalMotion, dt: number) {
  const step = 1 / 60;
  if (dt > step * 1.5) {
    const slices = Math.ceil(dt / step);
    const sub = dt / slices;
    for (let i = 0; i < slices; i += 1) advanceHorizontalMotion(motion, sub);
    return;
  }
  const felt = applyFelt(motion, dt);
  motion.vx = felt.vx;
  motion.vz = felt.vz;
  motion.wx = felt.wx;
  motion.wz = felt.wz;
  motion.wy *= Math.max(0, 1 - dt * 2);
  if (motionSettled(motion)) {
    motion.vx = 0;
    motion.vz = 0;
    motion.wx = 0;
    motion.wz = 0;
    motion.wy = 0;
    motion.longSpin = 0;
    motion.masseSpin = 0;
    motion.turned = 0;
    return;
  }

  if (motion.masseSpin === 0) return;
  const speed = Math.hypot(motion.vx, motion.vz);
  const hooking = motion.longSpin < -MASSE.masseMinimumSpinThreshold;
  if (
    Math.abs(motion.masseSpin) < MASSE.masseMinimumSpinThreshold ||
    (!hooking && (speed < MASSE.masseMinimumSpeed || Math.abs(motion.masseSpin) < 0.35))
  ) {
    motion.masseSpin = 0;
    return;
  }
  if (speed < 1e-4) return;
  motion.masseAge += dt;
  const delay = hooking ? MASSE.masseCurveDelay * 0.55 : MASSE.masseCurveDelay;
  const taken = 1 - Math.exp(-motion.masseAge / delay);
  const spin = motion.masseSpin / MASSE.masseSpinStrength;
  const back = hooking ? Math.min(1, -motion.longSpin / MASSE.masseBackspinStrength) : 0;
  const hook = 1 + back * MASSE.masseHookbackStrength;
  const lateral =
    spin * taken * MASSE.masseCurveStrength * (MASSE.masseLateralGrip / 0.42) * MASSE.masseArcadeCurveMultiplier * hook;
  const yawRate = Math.max(-MASSE.masseMaxYaw, Math.min(MASSE.masseMaxYaw, lateral / Math.max(speed, 0.9)));
  const yaw = yawRate * dt;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const turnX = motion.vx;
  const turnZ = motion.vz;
  const spinX = motion.wx;
  const spinZ = motion.wz;
  const drag = Math.min(speed, Math.abs(lateral) * MASSE.masseCurveDrag * dt);
  const retain = (speed - drag) / speed;
  motion.vx = (turnX * cos - turnZ * sin) * retain;
  motion.vz = (turnX * sin + turnZ * cos) * retain;
  motion.wx = spinX * cos - spinZ * sin;
  motion.wz = spinX * sin + spinZ * cos;
  motion.wy *= Math.max(0.9, retain);
  const nextHeading = Math.atan2(motion.vx, motion.vz);
  const prevHeading = Math.atan2(turnX, turnZ);
  let delta = nextHeading - prevHeading;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  motion.turned += delta;
  if (Math.abs(motion.turned) >= MASSE.masseMaxHookTurn) {
    motion.masseSpin = 0;
    motion.longSpin = 0;
    const radius = PHYSICS.ballRadius;
    motion.wx = motion.vz / radius;
    motion.wz = -motion.vx / radius;
  }
  const fade = hooking ? MASSE.masseSpinDecay * 0.55 : MASSE.masseSpinDecay;
  motion.masseSpin *= Math.exp(-fade * (0.45 + taken) * dt);
}

/**
 * Kinetic friction for a solid sphere. The same impulse changes speed and spin,
 * so cloth can turn backspin into reverse roll without adding energy.
 */
function applyFelt(motion: HorizontalMotion, dt: number) {
  const r = PHYSICS.ballRadius;
  const inertia = 0.4;
  const couple = 1 + 1 / inertia;
  let { vx, vz, wx, wz } = motion;
  const slipX = vx + r * wz;
  const slipZ = vz - r * wx;
  const slip = Math.hypot(slipX, slipZ);
  const drawShare = Math.min(1, Math.abs(motion.longSpin) / Math.max(MASSE.masseBackspinStrength, 1));
  const grip = 1 + (MASSE.masseLongitudinalGrip - 1) * drawShare;
  const accel = PHYSICS.feltFriction * Math.abs(PHYSICS.gravity) * grip;

  if (slip > 0.015 && accel > 0) {
    const killTime = slip / (couple * accel);
    const drawing = motion.longSpin < -MASSE.masseMinimumSpinThreshold;
    if (killTime <= dt) {
      const vx1 = vx - slipX / couple;
      const vz1 = vz - slipZ / couple;
      const released = releaseDraw(vx, vz, vx1, vz1, vz1 / r, -vx1 / r, drawing);
      const slowed = slowRoll(released.vx, released.vz, dt - killTime);
      vx = slowed.vx;
      vz = slowed.vz;
      wx = vz / r;
      wz = -vx / r;
      motion.longSpin *= 0.62;
    } else {
      const ax = slipX / slip;
      const az = slipZ / slip;
      const vx1 = vx - ax * accel * dt;
      const vz1 = vz - az * accel * dt;
      const dw = (accel * dt) / (inertia * r);
      const released = releaseDraw(vx, vz, vx1, vz1, wx + dw * az, wz - dw * ax, drawing);
      vx = released.vx;
      vz = released.vz;
      wx = released.wx;
      wz = released.wz;
      burnLongSpin(motion, dw);
    }
  } else {
    const slowed = slowRoll(vx, vz, dt);
    vx = slowed.vx;
    vz = slowed.vz;
    wx = vz / r;
    wz = -vx / r;
    motion.longSpin *= Math.exp(-2.2 * dt);
    if (Math.abs(motion.longSpin) < MASSE.masseMinimumSpinThreshold) motion.longSpin = 0;
  }

  return { vx, vz, wx, wz };
}

function releaseDraw(
  vx0: number,
  vz0: number,
  vx1: number,
  vz1: number,
  wx: number,
  wz: number,
  drawing: boolean,
) {
  if (!drawing) return { vx: vx1, vz: vz1, wx, wz };
  const before = Math.hypot(vx0, vz0);
  const after = Math.hypot(vx1, vz1);
  if (after <= before + 1e-5) return { vx: vx1, vz: vz1, wx, wz };
  const allowed = before + (after - before) * MASSE.masseRollbackKeep;
  const scale = allowed / after;
  return { vx: vx1 * scale, vz: vz1 * scale, wx, wz };
}

function burnLongSpin(motion: HorizontalMotion, dw: number) {
  const step = dw * (MASSE.masseSpinDecay / 1.7);
  if (motion.longSpin > 0) motion.longSpin = Math.max(0, motion.longSpin - step);
  else if (motion.longSpin < 0) motion.longSpin = Math.min(0, motion.longSpin + step);
}

function motionSettled(motion: HorizontalMotion) {
  if (Math.hypot(motion.vx, motion.vz) > PHYSICS.stopSpeed) return false;
  return Math.abs(motion.longSpin) <= MASSE.masseMinimumSpinThreshold;
}

function slowRoll(vx: number, vz: number, dt: number) {
  const speed = Math.hypot(vx, vz);
  if (speed < 1e-6 || dt <= 0) return { vx, vz };
  const drop = Math.min(speed, PHYSICS.rollingDecel * dt);
  const scale = (speed - drop) / speed;
  return { vx: vx * scale, vz: vz * scale };
}

export type PathPoint = { x: number; z: number };

/** Predicted path from the current ball, stopping at the rail, a crawl, or the time limit. */
export function predictShotPath(
  x: number,
  z: number,
  dirX: number,
  dirZ: number,
  speed: number,
  contact: ShotContact,
): PathPoint[] {
  if (speed < 0.05) return [];
  const motion = strikeMotion(dirX, dirZ, speed, contact);
  const limit = PHYSICS.railRadius - PHYSICS.ballRadius;
  const step = TRAJECTORY.trajectorySimulationStep;
  const points: PathPoint[] = [{ x, z }];
  let traveled = 0;
  let time = 0;

  while (time < TRAJECTORY.trajectoryPredictionTime && traveled < TRAJECTORY.trajectoryPreviewLength) {
    const previousX = x;
    const previousZ = z;
    x += motion.vx * step;
    z += motion.vz * step;
    const radius = Math.hypot(x - TABLE.centerX, z - TABLE.centerZ);
    if (radius >= limit) {
      points.push(clipToRail(previousX, previousZ, x, z, limit));
      break;
    }
    points.push({ x, z });
    traveled += Math.hypot(x - previousX, z - previousZ);
    advanceHorizontalMotion(motion, step);
    time += step;
    if (motionSettled(motion)) break;
  }

  return points;
}

function clipToRail(x0: number, z0: number, x1: number, z1: number, limit: number) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const fx = x0 - TABLE.centerX;
  const fz = z0 - TABLE.centerZ;
  const a = dx * dx + dz * dz;
  const b = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - limit * limit;
  const disc = b * b - 4 * a * c;
  if (a < 1e-10 || disc < 0) return { x: x1, z: z1 };
  const root = Math.sqrt(disc);
  const t0 = (-b - root) / (2 * a);
  const t1 = (-b + root) / (2 * a);
  const t = t0 >= 0 && t0 <= 1 ? t0 : t1;
  const k = Math.min(1, Math.max(0, t));
  return { x: x0 + dx * k, z: z0 + dz * k };
}
