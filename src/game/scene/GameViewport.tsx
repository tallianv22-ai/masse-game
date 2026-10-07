import { frameGameCamera } from "@/game/camera/frame-camera";
import { createLookControls } from "@/game/camera/look-controls";
import { CAMERA } from "@/game/config/camera";
import { LIGHTS } from "@/game/config/presentation";
import { createTablePhysics } from "@/game/physics";
import { useDebugEnabled } from "@/game/ui/debug";
import { DebugOverlay } from "@/game/ui/DebugOverlay";
import { useEffect, useRef, useState } from "react";
import {
  ACESFilmicToneMapping,
  Mesh,
  PCFShadowMap,
  PerspectiveCamera,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";
import { createGameScene } from "./GameScene";
import { logSceneStandardOnce } from "./log-standard";

/**
 * Full-viewport WebGL view.
 * The drawing buffer tracks the canvas CSS size, so the round table
 * is not stretched when the window changes.
 */
export function GameViewport() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const physicsRef = useRef<ReturnType<typeof createTablePhysics> | null>(null);
  const debug = useDebugEnabled();
  const [collidersOn, setCollidersOn] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      stencil: false,
      powerPreference: "high-performance",
    });
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = LIGHTS.exposure;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;

    let draw = () => {};
    const scene = createGameScene(debug, () => draw());
    const camera = new PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far);
    const look = createLookControls(canvas, () => draw());
    const physics = createTablePhysics(scene, camera, canvas);
    physicsRef.current = physics;

    let simFrame = 0;
    let lastTime = performance.now();
    const pump = (now: number) => {
      simFrame = 0;
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      const active = physics.step(dt);
      draw();
      if (active) simFrame = requestAnimationFrame(pump);
    };
    physics.setOnActive(() => {
      if (simFrame) return;
      lastTime = performance.now();
      simFrame = requestAnimationFrame(pump);
    });

    draw = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width < 2 || height < 2) return;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      if (!look.hasMoved()) {
        frameGameCamera(camera, camera.aspect);
        look.setBasis(camera);
      }
      look.apply(camera);
      renderer.render(scene, camera);
    };

    draw();
    logSceneStandardOnce();

    const observer = new ResizeObserver(() => draw());
    observer.observe(canvas);

    return () => {
      observer.disconnect();
      if (simFrame) cancelAnimationFrame(simFrame);
      physics.dispose();
      physicsRef.current = null;
      look.dispose();
      scene.traverse((object) => {
        const mesh = object as Mesh;
        mesh.geometry?.dispose();
        const material = mesh.material;
        if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
        else material?.dispose();
      });
      renderer.dispose();
    };
  }, [debug]);

  return (
    <>
      <canvas ref={canvasRef} className="game-canvas" />
      <div className="test-controls">
        <button type="button" onClick={() => physicsRef.current?.resetBall()}>
          Reset ball
        </button>
        <button
          type="button"
          aria-pressed={collidersOn}
          className={collidersOn ? "is-on" : undefined}
          onClick={() => {
            const visible = physicsRef.current?.toggleColliders();
            if (typeof visible === "boolean") setCollidersOn(visible);
          }}
        >
          Debug colliders
        </button>
      </div>
      <DebugOverlay />
    </>
  );
}
