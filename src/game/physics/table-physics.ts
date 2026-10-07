import { PHYSICS } from "@/game/config/physics";
import { TABLE } from "@/game/config/table";
import { Body, ContactMaterial, Cylinder, Material, SAPBroadphase, Sphere, Vec3, World } from "cannon-es";
import {
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Plane,
  Raycaster,
  RingGeometry,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
} from "three";

const _ray = new Raycaster();
const _ndc = new Vector2();
const _hit = new Vector3();
const _plane = new Plane(new Vector3(0, 1, 0), -PHYSICS.surfaceY);

/**
 * Invisible felt disc and a seamless circular rail, plus one test ball.
 * The imported table mesh is never added to the physics world.
 */
export function createTablePhysics(scene: Scene, camera: PerspectiveCamera, canvas: HTMLCanvasElement) {
  const world = new World({ gravity: new Vec3(0, PHYSICS.gravity, 0) });
  world.broadphase = new SAPBroadphase(world);
  world.allowSleep = true;

  const feltMaterial = new Material("felt");
  const ballMaterial = new Material("ball");
  world.addContactMaterial(
    new ContactMaterial(ballMaterial, feltMaterial, {
      friction: PHYSICS.feltFriction,
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

  const ballMesh = new Mesh(
    new SphereGeometry(PHYSICS.ballRadius, 32, 24),
    new MeshStandardMaterial({ color: "#f4f1ea", roughness: 0.32, metalness: 0.02 }),
  );
  ballMesh.name = "TestBall";
  ballMesh.castShadow = true;
  ballMesh.receiveShadow = true;
  scene.add(ballMesh);

  const guides = createGuides();
  scene.add(guides);

  let onActive = () => {};
  let tap: { id: number; x: number; y: number; moved: boolean } | null = null;

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
    ball.position.x = TABLE.centerX + nx * limit;
    ball.position.z = TABLE.centerZ + nz * limit;
    const outward = ball.velocity.x * nx + ball.velocity.z * nz;
    if (outward > 0) {
      const bounce = 1 + PHYSICS.railRestitution;
      ball.velocity.x -= bounce * outward * nx;
      ball.velocity.z -= bounce * outward * nz;
      const tx = -nz;
      const tz = nx;
      const tangent = ball.velocity.x * tx + ball.velocity.z * tz;
      ball.velocity.x -= tangent * PHYSICS.railFriction * tx;
      ball.velocity.z -= tangent * PHYSICS.railFriction * tz;
      ball.angularVelocity.scale(1 - PHYSICS.railFriction, ball.angularVelocity);
    }
    ball.wakeUp();
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
      ball.velocity.lengthSquared() > 0.0008 || ball.angularVelocity.lengthSquared() > 0.02
    );
  }

  function launch(dirX: number, dirZ: number) {
    const length = Math.hypot(dirX, dirZ);
    if (length < 1e-5) return;
    const nx = dirX / length;
    const nz = dirZ / length;
    const speed = PHYSICS.launchSpeed;
    ball.wakeUp();
    ball.velocity.set(nx * speed, 0, nz * speed);
    ball.angularVelocity.set((-nz * speed) / PHYSICS.ballRadius, 0, (nx * speed) / PHYSICS.ballRadius);
    onActive();
  }

  function resetBall() {
    ball.position.set(PHYSICS.ballStartX, restY, PHYSICS.ballStartZ);
    ball.velocity.set(0, 0, 0);
    ball.angularVelocity.set(0, 0, 0);
    ball.quaternion.set(0, 0, 0, 1);
    syncMesh();
    onActive();
  }

  function toggleColliders() {
    guides.visible = !guides.visible;
    onActive();
    return guides.visible;
  }

  function pointOnFelt(clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect();
    _ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    _ray.setFromCamera(_ndc, camera);
    if (!_ray.ray.intersectPlane(_plane, _hit)) return null;
    const x = _hit.x - TABLE.centerX;
    const z = _hit.z - TABLE.centerZ;
    if (Math.hypot(x, z) > PHYSICS.playingRadius) return null;
    return { x: _hit.x, z: _hit.z };
  }

  function onPointerDown(event: PointerEvent) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (tap) {
      if (event.pointerType === "touch") tap = null;
      return;
    }
    tap = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
  }

  function onPointerMove(event: PointerEvent) {
    if (!tap || tap.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 28) tap.moved = true;
  }

  function onPointerUp(event: PointerEvent) {
    if (!tap || tap.id !== event.pointerId) return;
    const start = tap;
    tap = null;
    if (start.moved) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 28) return;
    const hit = pointOnFelt(event.clientX, event.clientY);
    if (!hit) return;
    launch(hit.x - ball.position.x, hit.z - ball.position.z);
  }

  function onPointerCancel() {
    tap = null;
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.repeat) return;
    if (event.code === "KeyC") {
      toggleColliders();
      return;
    }
    if (event.code === "KeyR") {
      resetBall();
      return;
    }
    if (event.code !== "KeyL") return;
    event.preventDefault();
    launch(1, 0);
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerCancel);
  window.addEventListener("keydown", onKeyDown);

  syncMesh();

  return {
    setOnActive(listener: () => void) {
      onActive = listener;
    },
    resetBall,
    toggleColliders,
    collidersVisible: () => guides.visible,
    step(dt: number) {
      world.step(1 / 60, dt, 4);
      containOnRail();
      keepOnFelt();
      syncMesh();
      return moving();
    },
    dispose() {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
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
