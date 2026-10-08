import { PHYSICS } from "@/game/config/physics";
import { TABLE } from "@/game/config/table";
import { CylinderGeometry, Group, Mesh, MeshBasicMaterial, RingGeometry } from "three";

/**
 * Temporary layout for tuning a bottom-corner hook.
 * Not a pocket and not a bumper. The ball does not collide with either marker.
 * Aim from near the middle, straight toward +Z, with the red dot in the
 * bottom-right corner and a medium pull. The hook should pass the post
 * and roll back toward the ring.
 */
export function createCurlTest() {
  const group = new Group();
  group.name = "CurlTest";
  const y = PHYSICS.surfaceY;

  const post = new Mesh(
    new CylinderGeometry(0.16, 0.16, 0.42, 20),
    new MeshBasicMaterial({ color: "#2a241c", transparent: true, opacity: 0.9 }),
  );
  post.position.set(TABLE.centerX - 0.75, y + 0.21, TABLE.centerZ + 1.25);
  group.add(post);

  const ring = new Mesh(
    new RingGeometry(0.22, 0.34, 40),
    new MeshBasicMaterial({ color: "#7dffb2", transparent: true, opacity: 0.85, depthTest: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(TABLE.centerX - 1.95, y + 0.02, TABLE.centerZ + 1.1);
  ring.renderOrder = 3;
  group.add(ring);

  return group;
}
