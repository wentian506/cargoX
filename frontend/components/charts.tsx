"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const FOREST = "#171717";
const EMERALD = "#FFD60A";
const LIME = "#FFE873";
const PALETTE = ["#FFD60A", "#171717", "#FFE873", "#8A8A8A", "#F2C200", "#3D3D3D", "#FFF4BF"];

const axis = { fontSize: 10.5, fill: "#A5A5A5" } as const;
const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid #E8E8E8",
  boxShadow: "0 12px 30px -18px rgba(0,0,0,.35)",
  fontSize: 11.5,
  padding: "8px 10px",
} as const;

export function ForecastRibbon({
  data,
  height = 220,
}: {
  data: { date: string; p10_kg: number; p50_kg: number; p90_kg: number }[];
  height?: number;
}) {
  const rows = data.map((d) => ({
    date: d.date.slice(5),
    band: [d.p10_kg, d.p90_kg],
    p50: Math.round(d.p50_kg),
    p10: Math.round(d.p10_kg),
    p90: Math.round(d.p90_kg),
  }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={rows} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid stroke="#F1F1F1" vertical={false} />
        <XAxis dataKey="date" tick={axis} tickLine={false} axisLine={false} interval={2} />
        <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}t`} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v: any, n: string) => [
            n === "band" ? `${Math.round(v[0]).toLocaleString()}–${Math.round(v[1]).toLocaleString()} kg` : `${Number(v).toLocaleString()} kg`,
            n === "band" ? "p10–p90 band" : n === "p50" ? "p50 forecast" : n,
          ]}
        />
        <Area type="monotone" dataKey="band" stroke="none" fill={LIME} fillOpacity={0.45} />
        <Line type="monotone" dataKey="p50" stroke={FOREST} strokeWidth={2.2} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function MiniArea({
  data,
  xKey,
  yKey,
  height = 150,
  colour = EMERALD,
  label,
}: {
  data: any[];
  xKey: string;
  yKey: string;
  height?: number;
  colour?: string;
  label?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 6, right: 6, left: -22, bottom: 0 }}>
        <defs>
          <linearGradient id={`g-${yKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colour} stopOpacity={0.28} />
            <stop offset="100%" stopColor={colour} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#F1F1F1" vertical={false} />
        <XAxis dataKey={xKey} tick={axis} tickLine={false} axisLine={false} />
        <YAxis tick={axis} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [`${Number(v).toLocaleString()}${label ? " " + label : ""}`, ""]} />
        <Area type="monotone" dataKey={yKey} stroke={colour} strokeWidth={2} fill={`url(#g-${yKey})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function BarsChart({
  data,
  xKey,
  series,
  height = 240,
  stacked,
}: {
  data: any[];
  xKey: string;
  series: { key: string; label: string; colour?: string }[];
  height?: number;
  stacked?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 6, right: 8, left: -18, bottom: 0 }} barGap={2}>
        <CartesianGrid stroke="#F1F1F1" vertical={false} />
        <XAxis dataKey={xKey} tick={axis} tickLine={false} axisLine={false} />
        <YAxis tick={axis} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11, color: "#7A7A7A" }} />
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            fill={s.colour || PALETTE[i % PALETTE.length]}
            radius={[6, 6, 0, 0]}
            stackId={stacked ? "a" : undefined}
            maxBarSize={44}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Donut({
  data,
  height = 200,
  inner = 54,
}: {
  data: { name: string; value: number }[];
  height?: number;
  inner?: number;
}) {
  const total = data.reduce((a, b) => a + b.value, 0);
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={inner} outerRadius={inner + 22} paddingAngle={2} stroke="none">
            {data.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} formatter={(v: any, n: any) => [`${Number(v).toLocaleString()} (${total ? Math.round((Number(v) / total) * 100) : 0}%)`, n]} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-xl font-semibold text-ink">{total.toLocaleString()}</div>
        <div className="text-[10px] uppercase tracking-wider text-ink-muted">total</div>
      </div>
    </div>
  );
}

export function PolicyCompare({
  data,
  height = 260,
}: {
  data: { label: string; cost: number; load: number; empty: number }[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 6, right: 8, left: -14, bottom: 0 }}>
        <CartesianGrid stroke="#F1F1F1" vertical={false} />
        <XAxis dataKey="label" tick={{ ...axis, fontSize: 10 }} tickLine={false} axisLine={false} interval={0} />
        <YAxis tick={axis} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11, color: "#7A7A7A" }} />
        <Bar dataKey="cost" name="Cost / quintal (₹)" fill={FOREST} radius={[6, 6, 0, 0]} maxBarSize={40} />
        <Bar dataKey="load" name="Load factor (×100)" fill={EMERALD} radius={[6, 6, 0, 0]} maxBarSize={40} />
        <Bar dataKey="empty" name="Empty-km share (%)" fill={LIME} radius={[6, 6, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RadarScore({
  data,
  height = 240,
}: {
  data: { metric: string; a: number; b: number }[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={data} outerRadius="72%">
        <PolarGrid stroke="#E8E8E8" />
        <PolarAngleAxis dataKey="metric" tick={{ ...axis, fontSize: 10 }} />
        <Radar name="CARGOX" dataKey="a" stroke={EMERALD} fill={EMERALD} fillOpacity={0.28} />
        <Radar name="Individual booking" dataKey="b" stroke="#B5B5B5" fill="#B5B5B5" fillOpacity={0.14} />
        <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11, color: "#7A7A7A" }} />
        <Tooltip contentStyle={tooltipStyle} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

export function LineTrend({
  data,
  xKey,
  series,
  height = 220,
}: {
  data: any[];
  xKey: string;
  series: { key: string; label: string; colour?: string }[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid stroke="#F1F1F1" vertical={false} />
        <XAxis dataKey={xKey} tick={axis} tickLine={false} axisLine={false} />
        <YAxis tick={axis} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11, color: "#7A7A7A" }} />
        {series.map((s, i) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.colour || PALETTE[i % PALETTE.length]}
            strokeWidth={2.2}
            dot={{ r: 2.5 }}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
