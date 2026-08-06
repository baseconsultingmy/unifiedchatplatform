import { useEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "../i18n";

const THRESHOLD = 72;
const MAX_PULL = 120;
const RESISTANCE = 0.45;

function isScrollable(el: Element): boolean {
  const style = window.getComputedStyle(el);
  const oy = style.overflowY;
  if (!(oy === "auto" || oy === "scroll" || oy === "overlay")) return false;
  return (el as HTMLElement).scrollHeight > (el as HTMLElement).clientHeight + 1;
}

/** True when every scrollable ancestor of `start` (within `root`) is at the top. */
function canPullFrom(start: EventTarget | null, root: HTMLElement | null): boolean {
  if (!(start instanceof Element) || !root || !root.contains(start)) return false;
  let node: Element | null = start;
  while (node && node !== root) {
    if (isScrollable(node) && (node as HTMLElement).scrollTop > 1) return false;
    node = node.parentElement;
  }
  if (isScrollable(root) && root.scrollTop > 1) return false;
  return true;
}

type Phase = "idle" | "pulling" | "armed" | "refreshing";

export default function PullToRefresh({ children }: { children: ReactNode }) {
  const t = useT();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const startY = useRef(0);
  const tracking = useRef(false);
  const pullRef = useRef(0);
  const phaseRef = useRef<Phase>("idle");
  const [pull, setPull] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");

  function setPhaseBoth(next: Phase) {
    phaseRef.current = next;
    setPhase(next);
  }

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    function onTouchStart(e: TouchEvent) {
      if (phaseRef.current === "refreshing") return;
      if (e.touches.length !== 1) return;
      if (!canPullFrom(e.target, root)) {
        tracking.current = false;
        return;
      }
      tracking.current = true;
      startY.current = e.touches[0].clientY;
      pullRef.current = 0;
    }

    function onTouchMove(e: TouchEvent) {
      if (!tracking.current || phaseRef.current === "refreshing") return;
      if (e.touches.length !== 1) return;
      if (!canPullFrom(e.target, root)) {
        tracking.current = false;
        if (pullRef.current > 0) {
          pullRef.current = 0;
          setPull(0);
          setPhaseBoth("idle");
        }
        return;
      }

      const delta = e.touches[0].clientY - startY.current;
      if (delta <= 0) {
        if (pullRef.current > 0) {
          pullRef.current = 0;
          setPull(0);
          setPhaseBoth("idle");
        }
        return;
      }

      const next = Math.min(MAX_PULL, delta * RESISTANCE);
      pullRef.current = next;
      setPull(next);
      setPhaseBoth(next >= THRESHOLD ? "armed" : "pulling");
      if (e.cancelable) e.preventDefault();
    }

    function onTouchEnd() {
      if (!tracking.current) return;
      tracking.current = false;
      if (phaseRef.current === "refreshing") return;

      if (pullRef.current >= THRESHOLD) {
        setPhaseBoth("refreshing");
        setPull(THRESHOLD);
        window.setTimeout(() => {
          window.location.reload();
        }, 220);
        return;
      }

      pullRef.current = 0;
      setPull(0);
      setPhaseBoth("idle");
    }

    root.addEventListener("touchstart", onTouchStart, { passive: true });
    root.addEventListener("touchmove", onTouchMove, { passive: false });
    root.addEventListener("touchend", onTouchEnd);
    root.addEventListener("touchcancel", onTouchEnd);
    return () => {
      root.removeEventListener("touchstart", onTouchStart);
      root.removeEventListener("touchmove", onTouchMove);
      root.removeEventListener("touchend", onTouchEnd);
      root.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

  const label =
    phase === "refreshing"
      ? t("ptr.refreshing")
      : phase === "armed"
        ? t("ptr.release")
        : t("ptr.pull");

  const visible = pull > 4 || phase === "refreshing";

  return (
    <div className="ptr-root" ref={rootRef}>
      <div
        className={`ptr-indicator ${visible ? "visible" : ""} ${phase}`}
        style={{
          height: visible ? Math.max(pull, phase === "refreshing" ? THRESHOLD : 0) : 0,
        }}
        aria-hidden={!visible}
      >
        <div className="ptr-indicator-inner">
          <span
            className={`ptr-spinner ${phase === "refreshing" || phase === "armed" ? "spin" : ""}`}
          />
          <span className="ptr-label">{label}</span>
        </div>
      </div>
      <div
        className="ptr-content"
        style={{
          transform: pull > 0 || phase === "refreshing" ? `translateY(${pull}px)` : undefined,
          transition: tracking.current || phase === "pulling" || phase === "armed" ? "none" : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}
