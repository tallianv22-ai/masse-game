import type { BumperSpec } from "./bumper";
import type { PocketSpec } from "./pocket";
import { TABLE } from "./table";

/** One development pocket, where the curl-test ring used to sit. */
export const TEST_POCKETS: PocketSpec[] = [
  {
    id: "curl-target",
    x: TABLE.centerX - 1.95,
    z: TABLE.centerZ + 1.1,
  },
];

/** Three rubber bumpers with room to shoot between them. */
export const TEST_BUMPERS: BumperSpec[] = [
  { id: "tri-a", x: TABLE.centerX + 1.6, z: TABLE.centerZ + 2.05 },
  { id: "tri-b", x: TABLE.centerX + 0.85, z: TABLE.centerZ + 0.7 },
  { id: "tri-c", x: TABLE.centerX + 2.35, z: TABLE.centerZ + 0.7 },
];
