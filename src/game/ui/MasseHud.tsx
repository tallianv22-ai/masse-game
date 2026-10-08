import { MASSE, masseSideSpin } from "@/game/config/masse";
import {
  setMasseContact,
  toggleMasseDebug,
  toggleMasseMode,
  useMasseSession,
} from "@/game/cue/masse-session";
import { claimPointer, releasePointer } from "@/game/input/pointer-claim";
import type { PointerEvent as ReactPointerEvent } from "react";

export function MasseHud() {
  const session = useMasseSession();
  const dot = MASSE.masseContactTouchRadius;
  const reach = 46;

  function place(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const limit = rect.width / 2 - 18;
    let x = (dx / limit) * MASSE.masseMaxContactOffset;
    let y = (-dy / limit) * MASSE.masseMaxContactOffset;
    const size = Math.hypot(x, y);
    if (size > MASSE.masseMaxContactOffset) {
      x *= MASSE.masseMaxContactOffset / size;
      y *= MASSE.masseMaxContactOffset / size;
    }
    setMasseContact(x, y);
  }

  function grab(event: ReactPointerEvent<HTMLDivElement>) {
    event.stopPropagation();
    event.preventDefault();
    claimPointer(event.pointerId);
    event.currentTarget.setPointerCapture(event.pointerId);
    place(event);
  }

  function drag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.stopPropagation();
    event.preventDefault();
    place(event);
  }

  function release(event: ReactPointerEvent<HTMLDivElement>) {
    releasePointer(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  const spin = session.active ? masseSideSpin(session.contactX, Math.max(session.readout.power, 0.001)) : 0;

  return (
    <>
      <div className="masse-tools" data-touch="ui">
        {session.preparing ? (
          <button
            type="button"
            className={session.active ? "is-on" : undefined}
            aria-pressed={session.active}
            onClick={() => toggleMasseMode()}
          >
            Massé
          </button>
        ) : null}
        <button
          type="button"
          className={session.debug ? "is-on" : undefined}
          aria-pressed={session.debug}
          onClick={() => toggleMasseDebug()}
        >
          Spin debug
        </button>
      </div>
      {session.preparing && session.active ? (
        <div
          className="masse-pad"
          data-touch="ui"
          onPointerDown={grab}
          onPointerMove={drag}
          onPointerUp={release}
          onPointerCancel={release}
        >
          <span
            className="masse-dot"
            style={{
              width: dot,
              height: dot,
              transform: `translate(-50%, -50%) translate(${(session.contactX / MASSE.masseMaxContactOffset) * reach}px, ${(-session.contactY / MASSE.masseMaxContactOffset) * reach}px)`,
            }}
          />
        </div>
      ) : null}
      {session.debug ? (
        <pre className="masse-readout">{`MASSÉ
contact x  ${session.contactX.toFixed(2)}
contact y  ${session.contactY.toFixed(2)}
shot power ${session.readout.power.toFixed(2)}
spin       ${spin.toFixed(2)}
ball speed ${session.ballSpeed.toFixed(2)}
massé      ${session.active ? "on" : "off"}`}</pre>
      ) : null}
    </>
  );
}
