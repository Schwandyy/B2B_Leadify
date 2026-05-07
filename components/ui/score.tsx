import { cn } from "@/lib/utils/cn";

export function ScoreBadge({ score, className }: { score: number; className?: string }) {
  const tone =
    score >= 80
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : score >= 60
        ? "bg-sky-50 text-sky-700 ring-sky-200"
        : score >= 40
          ? "bg-amber-50 text-amber-800 ring-amber-200"
          : "bg-slate-50 text-slate-500 ring-slate-200";
  return (
    <span
      className={cn(
        "inline-flex h-7 min-w-10 items-center justify-center rounded-full px-2 text-xs font-semibold tabular-nums ring-1 ring-inset",
        tone,
        className,
      )}
    >
      {score}
    </span>
  );
}

export function ScoreBar({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  const tone =
    score >= 80 ? "bg-emerald-500" : score >= 60 ? "bg-sky-500" : score >= 40 ? "bg-amber-500" : "bg-slate-300";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={cn("h-full", tone)} style={{ width: `${clamped}%` }} />
    </div>
  );
}
