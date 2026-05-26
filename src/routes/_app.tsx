import { createFileRoute, Outlet, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import {
  Kanban as KanbanIcon,
  BarChart3,
  Settings as SettingsIcon,
  LogOut,
  Users,
} from "lucide-react";

export const Route = createFileRoute("/_app")({
  component: AppShell,
});

function AppShell() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const router = useRouter();
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (!loading && !user && !redirecting) {
      setRedirecting(true);
      navigate({ to: "/login" });
    }
  }, [loading, user, navigate, redirecting]);

  if (loading || !user) {
    return (
      <div className="grid place-items-center min-h-screen text-sm text-muted-foreground">
        Carregando…
      </div>
    );
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.invalidate();
    navigate({ to: "/login" });
  }

  const currentPath = router.state.location.pathname;
  const nav = [
    { to: "/kanban", label: "Kanban", icon: KanbanIcon },
    { to: "/dashboard", label: "Dashboard", icon: BarChart3 },
    { to: "/configuracoes", label: "Configurações", icon: SettingsIcon },
  ];

  return (
    <div className="min-h-screen flex">
      <aside className="w-60 shrink-0 border-r border-white/5 bg-white/[0.03] backdrop-blur-xl text-sidebar-foreground flex flex-col">
        <div className="px-5 py-5 border-b border-white/5">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-[oklch(0.55_0.22_260)] grid place-items-center text-primary-foreground shadow-[0_0_24px_-4px_oklch(0.78_0.13_215/0.5)]">
              <Users className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-bold tracking-tight text-white">SDR GROU</p>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Qualificação</p>
            </div>
          </div>
        </div>
        <nav className="p-3 space-y-1 flex-1">
          {nav.map((n) => {
            const Icon = n.icon;
            const active = currentPath.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
                  active
                    ? "bg-primary/15 text-primary font-semibold border border-primary/30"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground border border-transparent"
                }`}
              >
                <Icon className="h-4 w-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-white/5">
          <p className="px-3 text-xs text-muted-foreground truncate">{user.email}</p>
          <button
            onClick={signOut}
            className="mt-2 flex w-full items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}