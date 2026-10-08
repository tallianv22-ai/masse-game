import { COLORS } from "@/game/config/presentation";
import { createRoom } from "@/game/environment/Room";
import { createTable } from "@/game/table/Table";
import { Color, Scene } from "three";
import { createCurlTest } from "./CurlTest";
import { createDebugMarkers } from "./DebugMarkers";
import { createLights } from "./Lights";

/** Presentation only. Gameplay systems are not mounted in Phase 1. */
export function createGameScene(debug: boolean, onTableReady?: () => void) {
  const scene = new Scene();
  scene.background = new Color(COLORS.background);
  scene.add(createLights());
  scene.add(createRoom());
  scene.add(createTable(onTableReady));
  scene.add(createCurlTest());
  if (debug) scene.add(createDebugMarkers());
  return scene;
}
