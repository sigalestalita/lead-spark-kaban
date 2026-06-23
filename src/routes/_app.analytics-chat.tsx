import { createFileRoute, Link, Outlet, useNavigate, useParams, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createThread, deleteThread, listThreads } from "@/lib/analytics-chat.functions";
import { Button } from "@/components/ui/button";
import { MessageSquarePlus, Trash2, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_app/analytics-chat")({
  component: AnalyticsChatLayout,
});

function AnalyticsChatLayout() {
  const list = useServerFn(listThreads);
  const create = useServerFn(createThread);
  const del = useServerFn(deleteThread);
  const navigate = useNavigate();
  const router = useRouter();
  const params = useParams({ strict: false }) as { threadId?: string };

  const threadsQ = useQuery({ queryKey: ["act-threads"], queryFn: () => list() });

  async function onNew() {
    const { id } = await create();
    await threadsQ.refetch();
    navigate({ to: "/analytics-chat/$threadId", params: { threadId: id } });
  }

  async function onDelete(id: string) {
    if (!confirm("Apagar esta conversa?")) return;
    await del({ data: { id } });
    await threadsQ.refetch();
    if (params.threadId === id) {
      router.navigate({ to: "/analytics-chat" });
    }
  }

  return (
    <div className="flex h-[calc(100vh-0px)] min-h-0">
      <div className="w-64 shrink-0 border-r border-white/5 bg-card/30 flex flex-col">
        <div className="p-3 border-b border-white/5">
          <Button onClick={onNew} className="w-full" size="sm">
            <MessageSquarePlus className="h-4 w-4 mr-2" /> Nova conversa
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {threadsQ.isLoading && <p className="text-xs text-muted-foreground p-2">Carregando…</p>}
          {threadsQ.data?.length === 0 && (
            <p className="text-xs text-muted-foreground p-2">
              Nenhuma conversa ainda. Crie uma para começar a perguntar sobre seus leads.
            </p>
          )}
          {threadsQ.data?.map((t) => {
            const active = params.threadId === t.id;
            return (
              <div
                key={t.id}
                className={`group flex items-center gap-1 rounded-md ${active ? "bg-white/10" : "hover:bg-white/5"}`}
              >
                <Link
                  to="/analytics-chat/$threadId"
                  params={{ threadId: t.id }}
                  className="flex-1 px-2 py-1.5 text-xs truncate"
                  title={t.title}
                >
                  {t.title}
                </Link>
                <button
                  onClick={() => onDelete(t.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive"
                  aria-label="Apagar"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        {params.threadId ? (
          <Outlet />
        ) : (
          <div className="flex-1 grid place-items-center text-center p-8">
            <div className="max-w-md space-y-3">
              <Sparkles className="h-8 w-8 text-primary mx-auto" />
              <h2 className="text-lg font-semibold">Chat de Analytics</h2>
              <p className="text-sm text-muted-foreground">
                Pergunte em linguagem natural sobre o perfil dos leads, performance de campanhas e
                conversão no funil. A IA consulta os dados reais do CRM para responder.
              </p>
              <Button onClick={onNew}>
                <MessageSquarePlus className="h-4 w-4 mr-2" /> Começar nova conversa
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}