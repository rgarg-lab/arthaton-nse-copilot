"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyState } from "@/components/common/EmptyState";

/**
 * A generic dashboard driven by a data contract rather than by a schema.
 *
 * The point is reuse: a new idea produces `StatTile[]` and `SeriesPoint[]` from its own
 * tables and this renders without modification. Nothing here knows what the numbers mean.
 */

export type StatTile = {
  label: string;
  value: string | number;
  hint?: string;
};

export type SeriesPoint = { name: string; value: number };

/** Chart colours come from the theme tokens, so a config theme change carries through. */
const SERIES_COLOURS = ["#a78bfa", "#8f7cff", "#7565ff", "#f2b544", "#ff6b6b", "#87ccff"];

function Tile({ tile }: { tile: StatTile }) {
  return (
    <li className="rounded-panel border border-line bg-surface-1 p-4">
      <p className="label-caps text-ink-3">{tile.label}</p>
      <p className="mt-2 text-[28px] leading-none font-[420] tracking-[-0.03em] text-ink-1">{tile.value}</p>
      {tile.hint && <p className="mt-1.5 text-[12px] text-ink-4">{tile.hint}</p>}
    </li>
  );
}

function ChartFrame({
  title,
  children,
  empty,
}: {
  title: string;
  children: React.ReactNode;
  empty: boolean;
}) {
  return (
    <section className="rounded-panel border border-line bg-surface-1 p-4">
      <h2 className="label-caps mb-3 text-ink-3">{title}</h2>
      {empty ? (
        <EmptyState
          title="No data yet"
          description="Run the agent or load the demo seed and this fills in."
          className="border-none bg-transparent py-8"
        />
      ) : (
        <div className="h-56 w-full">{children}</div>
      )}
    </section>
  );
}

const TOOLTIP_STYLE = {
  background: "#131316",
  border: "1px solid rgb(255 255 255 / 11%)",
  borderRadius: 12,
  fontSize: 12,
  color: "#f5f5f7",
} as const;

export function Dashboard({
  tiles,
  byType,
  overTime,
}: {
  tiles: StatTile[];
  byType: SeriesPoint[];
  overTime: SeriesPoint[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <ul className="grid list-none gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Tile key={tile.label} tile={tile} />
        ))}
      </ul>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartFrame title="Trace events by type" empty={byType.length === 0}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byType} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
              <CartesianGrid stroke="rgb(255 255 255 / 8%)" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fill: "rgb(255 255 255 / 46%)", fontSize: 11 }}
                stroke="rgb(255 255 255 / 11%)"
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: "rgb(255 255 255 / 46%)", fontSize: 11 }}
                stroke="rgb(255 255 255 / 11%)"
              />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgb(255 255 255 / 4%)" }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} fill="#a78bfa" />
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>

        <ChartFrame title="Outbox by status" empty={overTime.length === 0}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={overTime} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={3}>
                {overTime.map((entry, i) => (
                  <Cell key={entry.name} fill={SERIES_COLOURS[i % SERIES_COLOURS.length]} stroke="none" />
                ))}
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} />
            </PieChart>
          </ResponsiveContainer>
        </ChartFrame>
      </div>
    </div>
  );
}
