"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils/cn";

export type ProductsView = "list" | "grid";

export function ProductsViewToggle({ current }: { current: ProductsView }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function setView(view: ProductsView) {
    const next = new URLSearchParams(sp.toString());
    if (view === "list") next.delete("view");
    else next.set("view", view);
    next.delete("page");
    router.push(`${pathname}?${next.toString()}`);
  }

  const items: Array<{ id: ProductsView; label: string }> = [
    { id: "list", label: "Liste" },
    { id: "grid", label: "Raster" },
  ];

  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-medium">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          onClick={() => setView(it.id)}
          className={cn(
            "rounded-md px-3 py-1.5 transition",
            current === it.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100",
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
