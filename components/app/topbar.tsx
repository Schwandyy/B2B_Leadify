import { logoutAction } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";

export function Topbar({ userName, userEmail }: { userName: string; userEmail: string }) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
      <div className="flex items-center gap-3">
        <div className="text-xs uppercase tracking-wide text-slate-400">Workspace</div>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right text-xs">
          <div className="font-medium text-slate-900">{userName}</div>
          <div className="text-slate-500">{userEmail}</div>
        </div>
        <form action={logoutAction}>
          <Button type="submit" variant="secondary" size="sm">
            Abmelden
          </Button>
        </form>
      </div>
    </header>
  );
}
