import type { CSSProperties } from "react";

/** A printed bar strip derived from the order code; decorative, the code is printed beside it. */
export function Barcode({ value }: { value: string }) {
  const bars: { x: number; w: number }[] = [];
  let x = 0;
  const quiet = 2;
  x += quiet;
  for (const char of `*${value}*`) {
    const code = char.charCodeAt(0);
    for (let i = 0; i < 3; i++) {
      const w = ((code >> (i * 2)) & 3) + 1;
      bars.push({ x, w });
      x += w + (((code >> (i + 3)) & 1) + 1);
    }
  }
  const width = x + quiet;
  return (
    <svg className="barcode" viewBox={`0 0 ${width} 40`} preserveAspectRatio="none" aria-hidden="true">
      {bars.map((bar) => (
        <rect key={bar.x} x={bar.x} y={0} width={bar.w} height={40} />
      ))}
    </svg>
  );
}

/** Fourteen days of WhatsApp queries for the watched product, drawn as a bar field. */
export function QueryBars({ level }: { level: number }) {
  const baseline = [22, 25, 21, 24, 27, 23, 26, 28, 25, 27];
  const tail = level >= 60 ? [38, 54, 71, level] : [26, 24, 27, Math.max(18, level)];
  const series = [...baseline, ...tail];
  const max = Math.max(100, ...series);
  return (
    <span className="bars" aria-hidden="true">
      {series.map((value, index) => (
        <i
          key={index}
          data-recent={index >= baseline.length && level >= 60 ? "" : undefined}
          style={{ "--h": `${(value / max) * 100}%` } as CSSProperties}
        />
      ))}
    </span>
  );
}

/** Twenty cells of stock coverage; the part an approved order added is drawn in the action colour. */
export function StockCells({ level, before }: { level: number; before: number | null }) {
  const filled = Math.round(level / 5);
  const kept = before === null ? filled : Math.min(filled, Math.round(before / 5));
  return (
    <span className="cells" aria-hidden="true">
      {Array.from({ length: 20 }, (_, index) => (
        <i key={index} data-fill={index < kept ? "stock" : index < filled ? "added" : undefined} />
      ))}
      <b className="cells-reorder" />
    </span>
  );
}

const DAYS = ["L", "M", "M", "J", "V", "S", "D"];

/** One week of promotion coverage. */
export function WeekCells({ state }: { state: "none" | "season" | "live" }) {
  return (
    <span className="week" aria-hidden="true">
      {DAYS.map((day, index) => (
        <i key={index} data-fill={state === "none" ? undefined : state}>
          {day}
        </i>
      ))}
    </span>
  );
}
