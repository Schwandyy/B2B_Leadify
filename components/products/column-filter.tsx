"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils/cn";

export type FilterOption = { value: string; label: string };

type Props = {
  param: string;
  options: FilterOption[];
  current: string;
  className?: string;
};

/**
 * Kleine Select-Dropdown unter einem Tabellen-Header. Schreibt seine
 * Auswahl in einen URL-Parameter und triggert eine Navigation.
 * Leerer value ("") löscht den Parameter — entspricht "Alle".
 */
export function ColumnFilter({ param, options, current, className }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = new URLSearchParams(sp.toString());
    const v = e.target.value;
    if (v) next.set(param, v);
    else next.delete(param);
    next.delete("page");
    const qs = next.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}`);
  };

  return (
    <select
      value={current}
      onChange={onChange}
      className={cn(
        "h-7 w-full rounded border border-slate-200 bg-white px-1.5 text-xs text-slate-700 shadow-sm",
        "focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-200",
        current && "border-slate-400 bg-slate-50 font-medium text-slate-900",
        className,
      )}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
