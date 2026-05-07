import { cn } from "@/lib/utils/cn";

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-slate-200 bg-white shadow-sm", className)}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("border-b border-slate-100 px-5 py-4", className)}>{children}</div>;
}

export function CardTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h3 className={cn("text-base font-semibold text-slate-900", className)}>{children}</h3>;
}

export function CardSubtitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-xs text-slate-500", className)}>{children}</p>;
}

export function CardBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("px-5 py-4", className)}>{children}</div>;
}

export function CardFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("border-t border-slate-100 px-5 py-3", className)}>{children}</div>;
}
