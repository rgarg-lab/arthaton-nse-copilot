"use client";

import { useActionState } from "react";
import { RISK_PROFILE_BOUNDS, type RiskProfile } from "@/schemas/finance";
import { addTickerAction, saveRiskProfileAction, type ActionState } from "@/lib/actions/watchlist";
import { bareTicker, probability } from "./format";

/**
 * Adding a name, and the risk profile.
 *
 * A client component only because both forms report their own errors inline via
 * `useActionState`. The mutations themselves are server actions — nothing here talks to
 * the model, and nothing here can change what it predicts.
 */

const INITIAL: ActionState = {};

export function AddTicker({
  universe,
  tracked,
}: {
  universe: readonly string[];
  tracked: string[];
}) {
  const [state, action, pending] = useActionState(addTickerAction, INITIAL);
  const available = universe.filter((t) => !tracked.includes(t));

  if (available.length === 0) {
    return (
      <p className="text-[12.5px] text-ink-3">
        Every name this model covers is already on your watchlist.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="label-caps text-[10px] text-ink-4">Add a name</span>
          <select
            name="ticker"
            defaultValue=""
            required
            className="rounded-card border border-line bg-surface-2 px-3 py-1.5 font-mono text-[12.5px] text-ink-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-1"
          >
            <option value="" disabled>
              Choose a ticker…
            </option>
            {available.map((t) => (
              <option key={t} value={t}>
                {bareTicker(t)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-pill border border-line-strong bg-glass-strong px-4 py-1.5 text-[12.5px] font-medium text-ink-1 transition-colors hover:bg-glass disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-1"
        >
          {pending ? "Adding…" : "Add"}
        </button>
      </div>
      {/*
        The select only offers names in the universe, so this error is for the case a
        request arrives some other way — the server validates regardless, because a
        watchlist entry the model has never seen would render a permanent "no data" row
        that looks like a bug rather than like a rejected input.
      */}
      {state.error && (
        <p role="alert" className="text-[12px] text-coral">
          {state.error}
        </p>
      )}
    </form>
  );
}

const TOLERANCES: { value: RiskProfile["riskTolerance"]; label: string; hint: string }[] = [
  { value: "conservative", label: "Conservative", hint: "I want very few, very strong calls" },
  { value: "balanced", label: "Balanced", hint: "Show me what the model is willing to call" },
  { value: "aggressive", label: "Aggressive", hint: "I will look at the marginal ones too" },
];

export function RiskProfileForm({
  profile,
  modelThreshold,
}: {
  profile: RiskProfile;
  /** The model's own frozen threshold. The floor for `minProbability`. */
  modelThreshold: number;
}) {
  const [state, action, pending] = useActionState(saveRiskProfileAction, INITIAL);
  const floor = Math.round(modelThreshold * 100);
  const current = Math.round(Math.max(modelThreshold, profile.minProbability) * 100);

  return (
    <form action={action} className="flex flex-col gap-4 rounded-panel border border-line bg-surface-1 p-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-[14px] font-medium text-ink-1">Risk profile</h2>
        <p className="max-w-[72ch] text-[12px] leading-relaxed text-ink-3">
          These settings change what <em>you</em> are shown. They cannot change what the model
          predicts — the abstention threshold is frozen in the committed artifact, and the
          minimum below is clamped up to it on save.
        </p>
      </header>

      <fieldset className="flex flex-col gap-2 border-0 p-0">
        <legend className="label-caps mb-1 text-[10px] text-ink-4">Risk tolerance</legend>
        <div className="flex flex-wrap gap-2">
          {TOLERANCES.map((t) => (
            <label
              key={t.value}
              title={t.hint}
              className="flex cursor-pointer items-center gap-1.5 rounded-pill border border-line bg-glass px-3 py-1.5 text-[12.5px] text-ink-2 has-[:checked]:border-line-strong has-[:checked]:bg-glass-strong has-[:checked]:text-ink-1 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink-1"
            >
              <input
                type="radio"
                name="riskTolerance"
                value={t.value}
                defaultChecked={profile.riskTolerance === t.value}
                className="size-3 accent-[var(--color-viz)]"
              />
              {t.label}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex flex-col gap-1.5">
        <span className="label-caps text-[10px] text-ink-4">
          Minimum conviction to show me a call
        </span>
        <div className="flex items-center gap-3">
          <input
            type="range"
            name="minProbability"
            // Bounds from the schema, so the control cannot offer a value the schema
            // would then reject. The floor is the model's frozen threshold, which is
            // always at or above the schema's own.
            min={modelThreshold}
            max={RISK_PROFILE_BOUNDS.minProbabilityCeiling}
            step={RISK_PROFILE_BOUNDS.minProbabilityStep}
            defaultValue={Math.max(modelThreshold, profile.minProbability)}
            className="h-1 flex-1 accent-[var(--color-viz)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink-1"
          />
          <output className="w-12 text-right font-mono text-[13px] text-ink-1">{current}%</output>
        </div>
        <span className="text-[11px] leading-snug text-ink-4">
          The model&rsquo;s own frozen gate is {probability(modelThreshold)}, which is the floor
          here. Raising this shows you fewer calls; it can never show you more.
        </span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="label-caps text-[10px] text-ink-4">Horizon</span>
        <select
          name="horizonSessions"
          defaultValue={profile.horizonSessions}
          className="w-fit rounded-card border border-line bg-surface-2 px-3 py-1.5 text-[12.5px] text-ink-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-1"
        >
          <option value={1}>1 session — what the model predicts</option>
          <option value={5}>5 sessions — not covered by this model</option>
          <option value={20}>20 sessions — not covered by this model</option>
        </select>
        <span className="text-[11px] leading-snug text-ink-4">
          The model predicts one session ahead and nothing else. A longer horizon is recorded
          so the assistant can tell you it is outside what has been measured, rather than
          answering anyway.
        </span>
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-pill border border-line-strong bg-glass-strong px-4 py-1.5 text-[12.5px] font-medium text-ink-1 transition-colors hover:bg-glass disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-1"
        >
          {pending ? "Saving…" : "Save profile"}
        </button>
        {state.ok && !pending && (
          <span role="status" className="text-[12px] text-status-acquired">
            Saved.
          </span>
        )}
        {state.error && (
          <span role="alert" className="text-[12px] text-coral">
            {state.error}
          </span>
        )}
      </div>
      <span className="sr-only">
        The minimum conviction cannot be set below {floor} percent, the model&rsquo;s frozen
        threshold.
      </span>
    </form>
  );
}
