import { useSyncExternalStore } from "react";

export type MasseReadout = {
  contactX: number;
  contactY: number;
  power: number;
  spin: number;
  active: boolean;
};

let preparing = false;
let active = false;
let contactX = 0;
let contactY = 0;
let debug = false;
let readout: MasseReadout = { contactX: 0, contactY: 0, power: 0, spin: 0, active: false };
let ballSpeed = 0;
const listeners = new Set<() => void>();

let view = capture();

function capture() {
  return { preparing, active, contactX, contactY, debug, readout, ballSpeed };
}

function emit() {
  view = capture();
  for (const listener of listeners) listener();
}

export function subscribeMasse(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isPreparingShot() {
  return preparing;
}

export function setPreparingShot(next: boolean) {
  if (preparing === next) return;
  preparing = next;
  if (!next) {
    active = false;
    contactX = 0;
    contactY = 0;
  }
  emit();
}

export function isMasseActive() {
  return active;
}

export function toggleMasseMode() {
  if (!preparing) return;
  active = !active;
  if (!active) {
    contactX = 0;
    contactY = 0;
  }
  emit();
}

export function masseContact() {
  return { x: contactX, y: contactY };
}

export function setMasseContact(x: number, y: number) {
  contactX = x;
  contactY = y;
  emit();
}

export function isMasseDebug() {
  return debug;
}

export function toggleMasseDebug() {
  debug = !debug;
  emit();
}

export function publishMasseReadout(next: MasseReadout) {
  readout = next;
  if (debug) emit();
}

export function getMasseReadout() {
  return readout;
}

export function publishBallSpeed(speed: number) {
  ballSpeed = speed;
  if (debug) emit();
}

export function getBallSpeed() {
  return ballSpeed;
}

export function useMasseSession() {
  return useSyncExternalStore(subscribeMasse, snapshot, snapshot);
}

function snapshot() {
  return view;
}
