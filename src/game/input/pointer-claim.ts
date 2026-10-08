/**
 * A pointer owned by the shot controls.
 * Camera handlers skip these so one finger cannot aim and orbit at once.
 */
const claimed = new Set<number>();

export function claimPointer(id: number) {
  claimed.add(id);
}

export function releasePointer(id: number) {
  claimed.delete(id);
}

export function isPointerClaimed(id: number) {
  return claimed.has(id);
}
