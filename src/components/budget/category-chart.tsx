import { Cell, Pie, PieChart, Tooltip } from "recharts";
import { formatMoney } from "@/lib/format";

const FILLS = [
  "color-mix(in oklab, var(--color-primary) 100%, white)",
  "color-mix(in oklab, var(--color-primary) 82%, white)",
  "color-mix(in oklab, var(--color-primary) 68%, white)",
  "color-mix(in oklab, var(--color-primary) 54%, white)",
  "color-mix(in oklab, var(--color-primary) 42%, white)",
  "color-mix(in oklab, var(--color-primary) 30%, white)",
  "color-mix(in oklab, var(--color-foreground) 22%, white)",
  "color-mix(in oklab, var(--color-foreground) 14%, white)",
];

interface CategoryChartProps {
  data: { category: string; amount: number }[];
}

export function CategoryChart({ data }: CategoryChartProps) {
  const total = data.reduce((sum, row) => sum + row.amount, 0);

  if (data.length === 0) {
    return (
      <p className="py-8 text-sm text-muted-foreground">
        No spending this month yet. Add an expense or import a statement.
      </p>
    );
  }

  return (
    <div className="grid items-center gap-5 md:grid-cols-[160px_1fr]">
      <div className="mx-auto hidden h-40 w-40 md:block">
        <PieChart width={160} height={160}>
          <Pie
            data={data}
            dataKey="amount"
            nameKey="category"
            cx={80}
            cy={80}
            innerRadius={48}
            outerRadius={72}
            paddingAngle={2}
            stroke="none"
          >
            {data.map((row, index) => (
              <Cell key={row.category} fill={FILLS[index % FILLS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) => formatMoney(Number(value ?? 0))}
            contentStyle={{
              background: "var(--color-card)",
              border: "1px solid var(--color-border)",
              borderRadius: 12,
              fontSize: 12,
            }}
          />
        </PieChart>
      </div>
      <ul className="grid gap-2.5">
        {data.map((row, index) => {
          const pct = total === 0 ? 0 : (row.amount / total) * 100;
          return (
            <li key={row.category} className="grid gap-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex items-center gap-2 text-sm">
                  <span
                    className="size-2 rounded-full"
                    style={{ background: FILLS[index % FILLS.length] }}
                  />
                  {row.category}
                </span>
                <span className="text-sm font-medium tabular-nums">{formatMoney(row.amount)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary/80"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
