import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

export const listWeeklyDigests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("weekly_digests")
      .select("id, week_start, subject, content_summary, content_html, stats, status, sent_at, error_message, created_at")
      .order("week_start", { ascending: false })
      .limit(52);
    if (error) throw error;
    return { digests: data ?? [] };
  });

export const triggerWeeklyDigestNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { force?: boolean }) => input ?? {})
  .handler(async ({ data }) => {
    const { generateWeeklyDigestInternal } = await import("./digest.functions");
    const gen = await generateWeeklyDigestInternal({ force: !!data.force });
    if (!("digestId" in gen) || !gen.digestId) {
      throw new Error("Falha ao gerar prévia");
    }
    return { ok: true, digestId: gen.digestId };
  });

export const approveAndSendDigest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { digestId: string }) => input)
  .handler(async ({ data }) => {
    const { sendDigestEmail } = await import("./digest.functions");
    const send = await sendDigestEmail(data.digestId);
    return { ok: true, send };
  });

const UpdateDraftSchema = z.object({
  digestId: z.string().uuid(),
  subject: z.string().min(1).max(200).optional(),
  contentHtml: z.string().min(1).max(200000).optional(),
  contentSummary: z.string().max(5000).optional(),
});

export const updateDigestDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateDraftSchema.parse(input))
  .handler(async ({ data }) => {
    const { wrapHtml } = await import("./digest.functions");
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from("weekly_digests")
      .select("id, status")
      .eq("id", data.digestId)
      .single();
    if (fetchErr || !existing) throw new Error("Edição não encontrada");
    if (existing.status === "sent") {
      throw new Error("Esta edição já foi enviada e não pode ser editada");
    }

    const patch: Record<string, unknown> = {};
    if (data.subject !== undefined) patch.subject = data.subject;
    if (data.contentHtml !== undefined) {
      // Se o usuário colar apenas conteúdo interno, embrulhamos.
      // Se já vier o <!doctype html>, mantemos como veio.
      const trimmed = data.contentHtml.trim();
      patch.content_html = /^<!doctype/i.test(trimmed) ? trimmed : wrapHtml(trimmed);
    }
    if (data.contentSummary !== undefined) patch.content_summary = data.contentSummary;

    if (Object.keys(patch).length === 0) return { ok: true, noop: true };

    const { error } = await supabaseAdmin
      .from("weekly_digests")
      .update(patch)
      .eq("id", data.digestId);
    if (error) throw error;
    return { ok: true };
  });

const LIDI_FIRST_EDITION_BRIEF = `Esta é a PRIMEIRA edição da newsletter interna da Grou e ela tem um propósito especial: apresentar a **Lidi** — a nova plataforma de qualificação e gestão de leads da Grou — para todo o time.

Pontos-chave que esta edição PRECISA cobrir, com entusiasmo e clareza:

1. Saudação calorosa e apresentação: "Conheçam a Lidi".
2. A história: a Lidi foi construída do zero em apenas **2 dias**, do conceito ao funcionamento real. Destaque isso como prova de velocidade e foco da Grou.
3. O que a Lidi faz, em linguagem do dia a dia (traduza, sem jargão):
   - Recebe automaticamente os leads que chegam pelas campanhas (Meta Ads, RD Station, Google Sheets, formulários) — nada mais se perde.
   - Enriquece cada lead sozinha: descobre site, LinkedIn, segmento e tamanho da empresa, e monta um resumo do contato.
   - Classifica e prioriza cada lead automaticamente (quem é mais quente, quem precisa de atenção), para o time atacar primeiro o que tem mais potencial.
   - Tem um kanban visual para mover os leads pelas etapas e bater o olho no funil inteiro.
   - Guarda todo o histórico de conversas, ligações, reuniões e WhatsApp em um só lugar.
   - Conversa com o RD Station CRM: o que mexe aqui aparece lá, sem retrabalho.
   - Tem dashboard com os números do funil em tempo real.
   - Toda quinta-feira gera, sozinha, esta newsletter com os números e destaques da semana.
4. Bloco "Recorte de leads — do domingo até agora": apresente os números reais do período (leads novos, enriquecidos, convertidos, interações), com cards visuais e linguagem leve ("novos contatos chegaram", "oportunidades avançaram"). Liste algumas empresas em destaque pelo nome.
5. Fechamento: convide o time a entrar, explorar e dar feedback. Tom: "isso é só o começo".

Importante: o nome da plataforma é **Lidi** (sempre escrito assim). Não use os termos internos antigos ("SDR GROU"). Trate a Lidi como o nome próprio dela.`;

export const triggerFirstLidiEdition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { generateWeeklyDigestInternal } = await import("./digest.functions");

    // Último domingo (UTC) 00:00 → agora
    const now = new Date();
    const sunday = new Date(now);
    sunday.setUTCHours(0, 0, 0, 0);
    sunday.setUTCDate(sunday.getUTCDate() - sunday.getUTCDay()); // dia 0 = domingo
    const weekStart = sunday.toISOString().slice(0, 10);

    const gen = await generateWeeklyDigestInternal({
      weekStart,
      force: true,
      rangeStartISO: sunday.toISOString(),
      rangeEndISO: now.toISOString(),
      briefOverride: LIDI_FIRST_EDITION_BRIEF,
    });
    if (!("digestId" in gen) || !gen.digestId) {
      throw new Error("Falha ao gerar a edição de estreia da Lidi");
    }
    return { ok: true, digestId: gen.digestId };
  });