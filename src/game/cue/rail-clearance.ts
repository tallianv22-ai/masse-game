import { CUE } from "@/game/config/cue";
import { PHYSICS } from "@/game/config/physics";

/**
 * Cross-section of the fitted Ogtable rail, meters above the felt.
 * `inner` is the cushion nose. `outer` is the outside of the wood.
 * Above the last sample the cue is clear of the rail.
 */
const RAIL_PROFILE = [
  { h: 0.025, inner: 5.13, outer: 5.978 },
  { h: 0.05, inner: 5.106, outer: 5.97 },
  { h: 0.075, inner: 5.088, outer: 5.996 },
  { h: 0.1, inner: 5.083, outer: 5.986 },
  { h: 0.125, inner: 5.078, outer: 5.977 },
  { h: 0.15, inner: 5.078, outer: 5.976 },
  { h: 0.175, inner: 5.09, outer: 5.975 },
  { h: 0.2, inner: 5.099, outer: 5.962 },
  { h: 0.225, inner: 5.128, outer: 5.932 },
  { h: 0.25, inner: 5.182, outer: 5.864 },
  { h: 0.275, inner: 5.238, outer: 5.776 },
  { h: 0.3, inner: 5.29, outer: 5.55 },
] as const;

const RAIL_TOP = RAIL_PROFILE[RAIL_PROFILE.length - 1].h;

/** Distance along the shaft from the ball surface to the tip and the butt. */
export function shaftDistances(retracted: number) {
  const tip = Math.max(0, CUE.tipGap + retracted);
  return { tip, butt: tip + CUE.cueLength };
}

/** A point on the cue. The shaft pivots on the ball, so the tip rises with the butt. */
export function shaftPoint(
  ballX: number,
  ballZ: number,
  dirX: number,
  dirZ: number,
  along: number,
  degrees: number,
) {
  const elev = (degrees * Math.PI) / 180;
  const radial = PHYSICS.ballRadius + along * Math.cos(elev);
  return {
    x: ballX + dirX * radial,
    z: ballZ + dirZ * radial,
    yAbove: CUE.cueHeight + along * Math.sin(elev),
  };
}

function railAt(height: number) {
  if (height >= RAIL_TOP) return null;
  if (height <= RAIL_PROFILE[0].h) return RAIL_PROFILE[0];
  for (let i = 1; i < RAIL_PROFILE.length; i += 1) {
    const next = RAIL_PROFILE[i];
    if (height > next.h) continue;
    const prev = RAIL_PROFILE[i - 1];
    const span = next.h - prev.h;
    const t = span > 0 ? (height - prev.h) / span : 0;
    return {
      inner: prev.inner + (next.inner - prev.inner) * t,
      outer: prev.outer + (next.outer - prev.outer) * t,
    };
  }
  return null;
}

function shaftHitsRail(
  ballX: number,
  ballZ: number,
  dirX: number,
  dirZ: number,
  along: number,
  degrees: number,
) {
  const elev = (degrees * Math.PI) / 180;
  const point = shaftPoint(ballX, ballZ, dirX, dirZ, along, degrees);
  const margin = CUE.railClearanceMargin;
  const drop = CUE.cueRadius * Math.cos(elev) + margin;
  const wood = railAt(point.yAbove - drop);
  if (!wood) return false;
  const dist = Math.hypot(point.x, point.z);
  const reach = CUE.cueRadius + margin;
  return dist + reach >= wood.inner && dist - reach <= wood.outer;
}

/** True when every sample from just behind the tip to `butt` stays off the rail. */
export function cueClearsRail(
  ballX: number,
  ballZ: number,
  dirX: number,
  dirZ: number,
  retracted: number,
  degrees: number,
  buttLimit?: number,
) {
  const { tip, butt } = shaftDistances(retracted);
  const end = Math.min(butt, buttLimit ?? butt);
  const start = Math.min(end, tip + CUE.cueRadius);
  if (end <= start + 0.001) return true;
  const samples = 36;
  for (let i = 0; i <= samples; i += 1) {
    const along = start + ((end - start) * i) / samples;
    if (shaftHitsRail(ballX, ballZ, dirX, dirZ, along, degrees)) return false;
  }
  return true;
}

function jawSpan(
  ballX: number,
  ballZ: number,
  dirX: number,
  dirZ: number,
  retracted: number,
  degrees: number,
) {
  const { tip, butt } = shaftDistances(retracted);
  const origin = shaftPoint(ballX, ballZ, dirX, dirZ, tip, degrees);
  let span = 0;
  let hits = 0;
  const samples = 40;
  for (let i = 0; i <= samples; i += 1) {
    const along = tip + ((butt - tip) * i) / samples;
    if (!shaftHitsRail(ballX, ballZ, dirX, dirZ, along, degrees)) continue;
    const point = shaftPoint(ballX, ballZ, dirX, dirZ, along, degrees);
    span = Math.max(span, Math.hypot(point.x - origin.x, point.z - origin.z));
    hits += 1;
  }
  return hits === 0 ? 0 : span;
}

/** The full shaft is either clear, or only meets the cushion in the jaw by the ball. */
function shaftAccepted(
  ballX: number,
  ballZ: number,
  dirX: number,
  dirZ: number,
  retracted: number,
  degrees: number,
) {
  if (cueClearsRail(ballX, ballZ, dirX, dirZ, retracted, degrees)) return true;
  return jawSpan(ballX, ballZ, dirX, dirZ, retracted, degrees) <= CUE.railJaw;
}

/** Signed gap from the shaft to the rail. Negative means the cue is in the wood. */
export function cueRailGap(
  ballX: number,
  ballZ: number,
  dirX: number,
  dirZ: number,
  retracted: number,
  degrees: number,
) {
  const { tip, butt } = shaftDistances(retracted);
  const elev = (degrees * Math.PI) / 180;
  const drop = CUE.cueRadius * Math.cos(elev);
  const reach = CUE.cueRadius + CUE.railClearanceMargin;
  let gap = Infinity;
  const samples = 28;
  for (let i = 0; i <= samples; i += 1) {
    const along = tip + ((butt - tip) * i) / samples;
    const point = shaftPoint(ballX, ballZ, dirX, dirZ, along, degrees);
    const bottom = point.yAbove - drop;
    const dist = Math.hypot(point.x, point.z);
    const wood = railAt(Math.min(bottom, RAIL_TOP - 0.001));
    if (!wood || bottom >= RAIL_TOP) {
      gap = Math.min(gap, bottom - RAIL_TOP);
      continue;
    }
    const innerGap = wood.inner - (dist + reach);
    const outerGap = dist - reach - wood.outer;
    if (innerGap >= 0 || outerGap >= 0) gap = Math.min(gap, Math.max(innerGap, outerGap));
    else gap = Math.min(gap, Math.max(innerGap, outerGap, bottom - RAIL_TOP));
  }
  return gap;
}

/**
 * Elevation for this aim. The cue starts rising before it meets the rail and
 * settles back down afterward, so it never dives into the wood and pops out.
 */
export function smoothCueElevation(
  ballX: number,
  ballZ: number,
  dirX: number,
  dirZ: number,
  retracted: number,
  preferred: number,
) {
  const needed = Math.max(preferred, minimumCueElevation(ballX, ballZ, dirX, dirZ, retracted));
  if (needed > preferred + 6) return needed;
  const gap = cueRailGap(ballX, ballZ, dirX, dirZ, retracted, preferred);
  if (gap > 0.45) return needed;
  const ramp = 0.5;
  let threat = needed;
  let away = ramp;
  for (const sign of [-1, 1]) {
    for (let step = 0.05; step <= ramp; step += 0.05) {
      const cos = Math.cos(step);
      const sin = Math.sin(step) * sign;
      const rx = dirX * cos - dirZ * sin;
      const rz = dirX * sin + dirZ * cos;
      const lift = Math.max(preferred, minimumCueElevation(ballX, ballZ, rx, rz, retracted));
      if (lift <= preferred + 6) continue;
      if (step < away) {
        away = step;
        threat = lift;
      }
      break;
    }
  }
  if (threat <= preferred + 6) return needed;
  const t = 1 - away / ramp;
  const fade = t * t * (3 - 2 * t);
  return Math.max(needed, preferred + (threat - preferred) * fade);
}

export function clearShaftDistance(
  ballX: number,
  ballZ: number,
  dirX: number,
  dirZ: number,
  retracted: number,
  degrees: number,
) {
  const { tip, butt } = shaftDistances(retracted);
  if (shaftAccepted(ballX, ballZ, dirX, dirZ, retracted, degrees)) return butt;
  const start = tip + CUE.cueRadius;
  let lo = start;
  let hi = butt;
  for (let i = 0; i < 16; i += 1) {
    const mid = (lo + hi) / 2;
    if (cueClearsRail(ballX, ballZ, dirX, dirZ, retracted, degrees, mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * Smallest elevation, in degrees, that lets the full shaft clear the rail.
 * If the rail is too close for a full shaft, returns the lowest angle that
 * keeps the longest cue still clear. May be 0.
 */
export function minimumCueElevation(
  ballX: number,
  ballZ: number,
  dirX: number,
  dirZ: number,
  retracted: number,
) {
  const accepted = (degrees: number) => shaftAccepted(ballX, ballZ, dirX, dirZ, retracted, degrees);
  if (accepted(0)) return 0;
  let lo = 0;
  let hi: number = CUE.maxClearanceElevation;
  if (accepted(hi)) {
    for (let i = 0; i < 18; i += 1) {
      const mid = (lo + hi) / 2;
      if (accepted(mid)) hi = mid;
      else lo = mid;
    }
    return hi;
  }
  let bestAngle = 0;
  let bestLength = clearShaftDistance(ballX, ballZ, dirX, dirZ, retracted, 0);
  for (let angle = 2; angle <= CUE.maxClearanceElevation; angle += 2) {
    const length = clearShaftDistance(ballX, ballZ, dirX, dirZ, retracted, angle);
    if (length > bestLength + 0.02) {
      bestLength = length;
      bestAngle = angle;
    }
  }
  return bestAngle;
}
