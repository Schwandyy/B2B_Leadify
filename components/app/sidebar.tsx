"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/products", label: "Produkte" },
  { href: "/products/import", label: "Import" },
  { href: "/leads", label: "Leads" },
  { href: "/admin", label: "Admin", admin: true },
  { href: "/admin/inventory", label: "Lagerbestand", admin: true },
];

export function Sidebar({ orgName, isAdmin }: { orgName: string; isAdmin: boolean }) {
  const pathname = usePathname();
  return (
    <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white lg:block">
      <div className="flex h-16 items-center gap-2 border-b border-slate-100 px-5">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-white">
          P2
        </span>
        <div>
          <div className="text-sm font-semibold leading-none">Product2Lead AI</div>
          <div className="mt-1 text-xs text-slate-500">{orgName}</div>
        </div>
      </div>
      <nav className="px-3 py-3">
        {NAV.filter((n) => !n.admin || isAdmin).map((n) => {
          const active = pathname === n.href || pathname.startsWith(`${n.href}/`);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "mb-1 block rounded-lg px-3 py-2 text-sm font-medium",
                active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100",
              )}
            >
              {n.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
