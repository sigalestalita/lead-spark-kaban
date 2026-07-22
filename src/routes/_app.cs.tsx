import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/cs")({
  head: () => ({ meta: [{ title: "Customer Success — COMPASS" }] }),
  component: CsLayout,
});

function CsLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const tabs = [
    { to: "/cs", label: "Carteira" },
    { to: "/cs/sinaleira-pda", label: "Sinaleira PDA" },
  ];
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1 border-b px-6 pt-4">
        {tabs.map((t) => {
          const active = t.to === "/cs" ? path === "/cs" : path.startsWith(t.to);
          return (
            <Link
              key={t.to}
              to={t.to}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
      <Outlet />
    </div>
  );
}
