"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useRef, type ReactNode } from "react";
import type { Application } from "@splinetool/runtime";

/**
 * The hero's 3D scene slot — opt-in, and empty by default.
 *
 * The original shipped a Spline scene from `public/nova/`. That artwork belonged to the
 * project this template was copied from, so it is not included here. What was left behind
 * was worse than nothing: the component still requested the deleted file, the dev server
 * answered with a 404 HTML page, and the WASM runtime threw
 * `Data read, but end of buffer not reached` trying to parse it as a scene. An error
 * boundary cannot help with that — the failure is inside an async load, not a render.
 *
 * So the scene is now gated on a configured URL. With none set, nothing is fetched and the
 * host is told immediately so it can settle on its fallback (the orb). To use one: export
 * a scene from Spline, drop it in `public/`, and set
 * `NEXT_PUBLIC_HERO_SCENE_URL=/your-scene.splinecode`.
 */
const Spline = dynamic(() => import("@splinetool/react-spline"), { ssr: false });

/** Set to serve a scene; unset means the hero uses its orb instead. */
export const NOVA_SCENE_URL = process.env.NEXT_PUBLIC_HERO_SCENE_URL ?? "";

/**
 * Where the runtime finds its wasm modules. Spline's own CDN by default; point it at a
 * local directory if you vendor them, as the original did.
 */
export const NOVA_WASM_PATH = process.env.NEXT_PUBLIC_HERO_SCENE_WASM_PATH ?? undefined;

/**
 * How long a host waits before it stops calling the scene "loading". A stalled request
 * resolves neither `onLoad` nor `onError`, so only a timer notices it.
 */
export const NOVA_SCENE_TIMEOUT_MS = 8000;

/**
 * @splinetool/react-spline has no error callback: when `Application.load()` rejects it
 * stores the error and re-throws it from render, so the only way to hear about a failed
 * scene is to catch that throw. This boundary does, tells the host once, and renders
 * nothing — the host owns the fallback.
 */
class SceneErrorBoundary extends Component<{ onError?: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError?.();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function NovaScene({
  className,
  onLoad,
  onError,
}: {
  className?: string;
  onLoad?: (app: Application) => void;
  /** Called once if the scene is not configured, or fails to load. */
  onError?: () => void;
}) {
  const configured = NOVA_SCENE_URL.length > 0;
  const notified = useRef(false);

  // Reported from an effect, not during render: calling back into the host mid-render
  // would set state on a parent that is still rendering. Guarded by a ref because the
  // host passes an inline callback, whose identity changes on every render.
  useEffect(() => {
    if (configured || notified.current) return;
    notified.current = true;
    onError?.();
  }, [configured, onError]);

  if (!configured) return null;

  return (
    <SceneErrorBoundary onError={onError}>
      <Spline scene={NOVA_SCENE_URL} wasmPath={NOVA_WASM_PATH} className={className} onLoad={onLoad} />
    </SceneErrorBoundary>
  );
}
