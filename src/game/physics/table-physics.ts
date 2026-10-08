import { PHYSICS } from "@/game/config/physics";
import { TABLE } from "@/game/config/table";
import { TRAJECTORY } from "@/game/config/trajectory";
import { publishBallSpeed } from "@/game/cue/masse-session";
import { advanceHorizontalMotion, strikeMotion, type HorizontalMotion } from "@/game/physics/shot-motion";
import { Body, ContactMaterial, Cylinder, Material, SAPBroadphase, Sphere, Vec3, World } from "cannon-es";
import {
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  Scene,
  SphereGeometry,
} from "three";

/**
 * Invisible felt disc and a seamless circular rail, plus one test ball.
 * The imported table mesh is never added to the physics world.
 */
export function createTablePhysics(scene: Scene, _camera: unknown, _canvas: unknown) {
  const world = new World({ gravity: new Vec3(0, PHYSICS.gravity, 0) });
  world.broadphase = new SAPBroadphase(world);
  world.allowSleep = true;

  const feltMaterial = new Material("felt");
  const ballMaterial = new Material("ball");
  world.addContactMaterial(
    new ContactMaterial(ballMaterial, feltMaterial, {
      friction: 0,
      restitution: PHYSICS.feltRestitution,
    }),
  );

  const felt = new Body({ mass: 0, material: feltMaterial });
  const feltRadius = PHYSICS.playingRadius + PHYSICS.ballRadius + 0.08;
  felt.addShape(
    new Cylinder(feltRadius, feltRadius, PHYSICS.surfaceThickness, 48),
    new Vec3(TABLE.centerX, PHYSICS.surfaceY - PHYSICS.surfaceThickness / 2, TABLE.centerZ),
  );
  world.addBody(felt);

  const restY = PHYSICS.surfaceY + PHYSICS.ballRadius;
  const ball = new Body({
    mass: PHYSICS.ballMass,
    material: ballMaterial,
    linearDamping: PHYSICS.linearDamping,
    angularDamping: PHYSICS.angularDamping,
    position: new Vec3(PHYSICS.ballStartX, restY, PHYSICS.ballStartZ),
    sleepSpeedLimit: 0.04,
    sleepTimeLimit: 0.4,
  });
  ball.addShape(new Sphere(PHYSICS.ballRadius));
  world.addBody(ball);

  const ballMaterialMesh = new MeshStandardMaterial({ color: "#f4f1ea", roughness: 0.32, metalness: 0.02 });
  const ballMesh = new Mesh(new SphereGeometry(PHYSICS.ballRadius, 32, 24), ballMaterialMesh);
  ballMesh.name = "TestBall";
  ballMesh.castShadow = true;
  ballMesh.receiveShadow = true;
  scene.add(ballMesh);

  const guides = createGuides();
  scene.add(guides);

  let onActive = () => {};
  let masseSpin = 0;
  let masseAge = 0;
  let longSpin = 0;
  let turned = 0;
  const motion: HorizontalMotion = {
    vx: 0,
    vz: 0,
    wx: 0,
    wz: 0,
    wy: 0,
    masseSpin: 0,
    longSpin: 0,
    turned: 0,
    masseAge: 0,
  };

  function syncMesh() {
    ballMesh.position.set(ball.position.x, ball.position.y, ball.position.z);
    ballMesh.quaternion.set(ball.quaternion.x, ball.quaternion.y, ball.quaternion.z, ball.quaternion.w);
  }

  function containOnRail() {
    const x = ball.position.x - TABLE.centerX;
    const z = ball.position.z - TABLE.centerZ;
    const radius = Math.hypot(x, z);
    const limit = PHYSICS.railRadius - PHYSICS.ballRadius;
    if (radius <= limit || radius < 1e-8) return;
    const nx = x / radius;
    const nz = z / radius;
    ball.position.x = TABLE.centerX + nx * (limit - 0.002);
    ball.position.z = TABLE.centerZ + nz * (limit - 0.002);
    const outward = ball.velocity.x * nx + ball.velocity.z * nz;
    if (outward > 0.05) {
      const reflected = Math.max(0, PHYSICS.railRestitution * outward - PHYSICS.railLoss);
      ball.velocity.x -= outward * nx;
      ball.velocity.z -= outward * nz;
      ball.velocity.x -= reflected * nx;
      ball.velocity.z -= reflected * nz;
      const tx = -nz;
      const tz = nx;
      const tangent = ball.velocity.x * tx + ball.velocity.z * tz;
      const kept = tangent * (1 - PHYSICS.railFriction);
      ball.velocity.x += (kept - tangent) * tx;
      ball.velocity.z += (kept - tangent) * tz;
      const r = PHYSICS.ballRadius;
      ball.angularVelocity.x = (ball.velocity.z / r) * 0.85;
      ball.angularVelocity.z = (-ball.velocity.x / r) * 0.85;
      ball.wakeUp();
      return;
    }
    if (outward > 0) {
      ball.velocity.x -= outward * nx;
      ball.velocity.z -= outward * nz;
    }
  }

  function rollAndCurve(dt: number) {
    let left = dt;
    const step = TRAJECTORY.trajectorySimulationStep;
    while (left > 1e-6) {
      const slice = Math.min(step, left);
      motion.vx = ball.velocity.x;
      motion.vz = ball.velocity.z;
      motion.wx = ball.angularVelocity.x;
      motion.wz = ball.angularVelocity.z;
      motion.wy = ball.angularVelocity.y;
      motion.masseSpin = masseSpin;
      motion.masseAge = masseAge;
      motion.longSpin = longSpin;
      motion.turned = turned;
      advanceHorizontalMotion(motion, slice);
      ball.velocity.x = motion.vx;
      ball.velocity.z = motion.vz;
      ball.angularVelocity.set(motion.wx, motion.wy, motion.wz);
      masseSpin = motion.masseSpin;
      masseAge = motion.masseAge;
      longSpin = motion.longSpin;
      turned = motion.turned;
      left -= slice;
    }
  }

  function keepOnFelt() {
    const low = restY - 0.012;
    const high = restY + 0.02;
    if (ball.position.y < low) {
      ball.position.y = restY;
      if (ball.velocity.y < 0) ball.velocity.y = 0;
    } else if (ball.position.y > high) {
      ball.position.y = restY;
      ball.velocity.y = 0;
    }
  }

  function moving() {
    return (
      ball.velocity.lengthSquared() > PHYSICS.stopSpeed * PHYSICS.stopSpeed ||
      ball.angularVelocity.lengthSquared() > 0.04
    );
  }

  function strike(
    dirX: number,
    dirZ: number,
    speed: number,
    contact?: { x: number; y: number } | null,
  ) {
    const length = Math.hypot(dirX, dirZ);
    if (length < 1e-5 || speed <= 0) return;
    const shot = strikeMotion(dirX, dirZ, speed, contact ?? null);
    ball.wakeUp();
    ball.velocity.set(shot.vx, 0, shot.vz);
    ball.angularVelocity.set(shot.wx, shot.wy, shot.wz);
    masseSpin = shot.masseSpin;
    longSpin = shot.longSpin;
    turned = 0;
    masseAge = 0;
    onActive();
  }

  function resetBall() {
    ball.position.set(PHYSICS.ballStartX, restY, PHYSICS.ballStartZ);
    ball.velocity.set(0, 0, 0);
    ball.angularVelocity.set(0, 0, 0);
    ball.quaternion.set(0, 0, 0, 1);
    masseSpin = 0;
    longSpin = 0;
    turned = 0;
    masseAge = 0;
    syncMesh();
    onActive();
  }

  function toggleColliders() {
    guides.visible = !guides.visible;
    onActive();
    return guides.visible;
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.repeat) return;
    if (event.code === "KeyC") toggleColliders();
    else if (event.code === "KeyR") resetBall();
  }

  window.addEventListener("keydown", onKeyDown);

  syncMesh();

  return {
    setOnActive(listener: () => void) {
      onActive = listener;
    },
    resetBall,
    toggleColliders,
    collidersVisible: () => guides.visible,
    ballPosition() {
      return { x: ball.position.x, y: ball.position.y, z: ball.position.z };
    },
    ballSpeed() {
      return Math.hypot(ball.velocity.x, ball.velocity.z);
    },
    strike,
    setTargeted(on: boolean) {
      ballMaterialMesh.emissive.set(on ? "#6d5a30" : "#000000");
      ballMaterialMesh.emissiveIntensity = on ? 0.45 : 0;
    },
    step(dt: number) {
      world.step(1 / 60, dt, 4);
      rollAndCurve(dt);
      containOnRail();
      keepOnFelt();
      syncMesh();
      publishBallSpeed(Math.hypot(ball.velocity.x, ball.velocity.z));
      return moving();
    },
    dispose() {
      window.removeEventListener("keydown", onKeyDown);
      world.removeBody(ball);
      world.removeBody(felt);
      scene.remove(ballMesh);
      scene.remove(guides);
    },
  };
}

function createGuides() {
  const group = new Group();
  group.name = "PhysicsColliderGuides";
  group.visible = PHYSICS.debugColliders;

  const feltRing = new Mesh(
    new RingGeometry(PHYSICS.playingRadius - 0.025, PHYSICS.playingRadius, 128),
    new MeshBasicMaterial({ color: "#7dffb2", transparent: true, opacity: 0.9, depthTest: false }),
  );
  feltRing.rotation.x = -Math.PI / 2;
  feltRing.position.set(TABLE.centerX, PHYSICS.surfaceY + 0.01, TABLE.centerZ);
  feltRing.renderOrder = 4;
  group.add(feltRing);

  const rail = new Mesh(
    new CylinderGeometry(PHYSICS.railRadius, PHYSICS.railRadius, PHYSICS.railHeight, 96, 1, true),
    new MeshBasicMaterial({
      color: "#ff5c3a",
      transparent: true,
      opacity: 0.28,
      depthTest: false,
      wireframe: true,
    }),
  );
  rail.position.set(TABLE.centerX, PHYSICS.surfaceY + PHYSICS.railHeight / 2, TABLE.centerZ);
  rail.renderOrder = 4;
  group.add(rail);

  return group;
}
