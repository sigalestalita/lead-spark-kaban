import { createFileRoute, Outlet, Link, useRouterState } from "@tanstack/react-router";
import { MessageCircle, FileText, Megaphone, Zap, Settings2, BarChart3, Repeat } from "lucide-react";

export const Route = createFileRoute("/_app/whatsapp")({
  component: WhatsappLayout,
});

function WhatsappLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const tabs = [
    { to: "/whatsapp", label: "Inbox", icon: MessageCircle, exact: true },
    { to: "/whatsapp/metricas", label: "Métricas", icon: BarChart3, exact: false },
    { to: "/whatsapp/templates", label: "Templates", icon: FileText, exact: false },
    { to: "/whatsapp/campanhas", label: "Campanhas", icon: Megaphone, exact: false },
    { to: "/whatsapp/automacoes", label: "Automações", icon: Zap, exact: false },
    { to: "/whatsapp/fups", label: "FUPs", icon: Repeat, exact: false },
    { to: "/whatsapp/contas", label: "Contas", icon: Settings2, exact: false },
  ];

  return (
    <div className="h-screen flex flex-col">
      <header className="px-6 py-3 border-b border-white/5 flex items-center gap-6">
        <h1 className="text-lg font-semibold flex items-center gap-2 shrink-0">
          <MessageCircle className="h-5 w-5" /> WhatsApp
        </h1>
        <nav className="flex items-center gap-1">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
            return (
              <Link
                key={t.to}
                to={t.to}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                  active
                    ? "bg-primary/15 text-primary font-medium border border-primary/30"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground border border-transparent"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <div className="flex-1 min-h-0">
        <Outlet />
      </div>
    </div>
  );
}