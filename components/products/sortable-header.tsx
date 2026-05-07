"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils/cn";

export type SortKey =
  | "masterSku"
  | "name"
  | "category"
  | "stock"
  | "leads"
  | "runs"
  | "createdAt";
export type SortDir = "asc" | "desc";

type Props = {
  label: string;
  sortKey: SortKey;
  align?: "left" | "right" | "center";
  className?: string;
};

export function SortableHeader({ label, sortKey, align = "left", className }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const currentSort = sp.get("sort") ?? "masterSku";
  const currentDir = (sp.get("dir") as SortDir | null) ?? "asc";
  const active = currentSort === sortKey;
  const nextDir: SortDir = active && currentDir === "asc" ? "desc" : "asc";

  const onClick = () => {
    const next = new URLSearchParams(sp.toString());
    next.set("sort", sortKey);
    next.set("dir", nextDir);
    next.delete("page");
    router.push(`${pathname}?${next.toString()}`);
  };

  const justify = align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group inline-flex w-full items-center gap-1 select-none cursor-pointer",
        "text-left font-medium uppercase tracking-wide",
        "hover:text-slate-900",
        justify,
        active ? "text-slate-900" : "text-slate-500",
        className,
      )}
    >
      <span>{label}</span>
      <span
        aria-hidden
        className={cn(
          "text-[10px] leading-none transition",
          active ? "opacity-100" : "opacity-30 group-hover:opacity-70",
        )}
      >
        {active ? (currentDir === "asc" ? "▲" : "▼") : "↕"}
      </span>
    </button>
  );
}
