import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  cargos,
  FAIXAS,
  getFaixa,
  TIPOS_OCORRENCIA,
  totalOcorrencias,
  type CargoDataset,
  type Colaborador,
  type Faixa,
  type TipoOcorrenciaKey,
  cargosCompletos,
  isTrainee,
  type AnyCargo,
  type TraineeDataset,
} from "@/data/cargos";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import gerdauLogoWhite from "@/assets/gerdau-logo-white.webp";
import grouLogo from "@/assets/grou-logo.png";
import introBg from "@/assets/intro-bg.png";
import { IntroSplash } from "@/components/IntroSplash";
import {
  LayoutDashboard,
  ListOrdered,
  Grid3x3,
  BarChart3,
  Table2,
  Download,
  Lightbulb,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Sparkles,
  Clock,
  User,
  Sprout,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Painel — Compatibilidade x Ocorrências de Segurança" },
      {
        name: "description",
        content:
          "Relação entre compatibilidade comportamental e ocorrências de segurança do trabalho por cargo.",
      },
    ],
  }),
  component: PainelPage,
});

function PainelPage() {
  const [cargoId, setCargoId] = useState(cargosCompletos[0].id);
  const cargo = cargosCompletos.find((c) => c.id === cargoId) ?? cargosCompletos[0];
  return (
    <SlideshowShell cargo={cargo} cargoId={cargoId} setCargoId={setCargoId} />
  );
}

/* ---------------- Command Center: Sidebar + Header ---------------- */

const NAV_ITEMS = [
  { id: "visao-geral", label: "Visão geral", icon: LayoutDashboard },
  { id: "ranking", label: "Ranking", icon: ListOrdered },
  { id: "heatmap", label: "Mapa de calor", icon: Grid3x3 },
  { id: "comparativo", label: "Comparativo", icon: BarChart3 },
  { id: "base", label: "Base bruta", icon: Table2 },
  { id: "recomendacoes", label: "Recomendações", icon: Lightbulb },
];

/* ---------------- Slideshow Shell ---------------- */

const SLIDES: {
  id: string;
  label: string;
  icon: typeof LayoutDashboard;
  render: (cargo: CargoDataset) => ReactNode;
}[] = [
  {
    id: "visao-geral",
    label: "Visão geral",
    icon: LayoutDashboard,
    render: (cargo) => (
      <div className="space-y-8">
        <Intro />
        <DescricaoCargo cargo={cargo} />
        <KpiCards cargo={cargo} />
        <MensagemChave cargo={cargo} />
      </div>
    ),
  },
  { id: "ranking", label: "Ranking", icon: ListOrdered, render: (cargo) => <Ranking cargo={cargo} /> },
  { id: "heatmap", label: "Mapa de calor", icon: Grid3x3, render: (cargo) => <Heatmap cargo={cargo} /> },
  { id: "comparativo", label: "Comparativo", icon: BarChart3, render: (cargo) => <ComparativoFaixas cargo={cargo} /> },
  { id: "base", label: "Base bruta", icon: Table2, render: (cargo) => <TabelaDetalhada cargo={cargo} /> },
  { id: "recomendacoes", label: "Recomendações", icon: Lightbulb, render: (cargo) => <Recomendacoes cargo={cargo} /> },
];

const TRAINEE_SLIDES: {
  id: string;
  label: string;
  icon: typeof LayoutDashboard;
  render: (cargo: AnyCargo) => ReactNode;
}[] = [
  {
    id: "trainee-analise",
    label: "Análise Trainee",
    icon: GraduationCap,
    render: (cargo) => (isTrainee(cargo) ? <TraineeAnalise cargo={cargo} /> : null),
  },
];

function SlideshowShell({
  cargo,
  cargoId,
  setCargoId,
}: {
  cargo: AnyCargo;
  cargoId: string;
  setCargoId: (id: string) => void;
}) {
  const [index, setIndex] = useState(0);
  const trainee = isTrainee(cargo);
  const activeSlides = trainee ? TRAINEE_SLIDES : SLIDES;
  const total = activeSlides.length;
  const safeIndex = Math.min(index, total - 1);
  const slide = activeSlides[safeIndex];

  // Reset to first slide (Visão geral) whenever the selected cargo changes
  useEffect(() => {
    setIndex(0);
  }, [cargoId]);

  const go = (i: number) => setIndex(Math.max(0, Math.min(total - 1, i)));
  const next = () => setIndex((i) => (i + 1) % total);
  const prev = () => setIndex((i) => (i - 1 + total) % total);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        prev();
      } else if (e.key === "Home") {
        setIndex(0);
      } else if (e.key === "End") {
        setIndex(total - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [total]);

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-hidden bg-[#020617] text-foreground">
      <IntroSplash />

      {/* Dark themed background (same vibe as intro) */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-0">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${introBg})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            opacity: 0.55,
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(2,6,23,0.35) 0%, rgba(2,6,23,0.75) 55%, rgba(2,6,23,0.95) 100%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(2,6,23,0.85) 0%, rgba(2,6,23,0.35) 18%, rgba(2,6,23,0.35) 82%, rgba(2,6,23,0.9) 100%)",
          }}
        />
      </div>

      <SlideTopBar
        cargo={cargo}
        cargoId={cargoId}
        setCargoId={setCargoId}
        index={safeIndex}
        total={total}
        slideLabel={slide.label}
      />

      {/* Slide stage — click on dark area advances */}
      <main
        onClick={next}
        className="relative z-10 flex flex-1 cursor-pointer flex-col items-stretch px-3 pb-32 pt-4 md:px-10 md:pb-36 md:pt-6"
      >
        <div className="mx-auto w-full max-w-6xl">
          <div className="mb-3 flex items-center gap-3 px-1 text-white/85 md:mb-4">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.28em] text-white/60">
              Slide {String(safeIndex + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
            </span>
            <span className="h-px flex-1 bg-white/15" />
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-white/80">
              {slide.label}
            </span>
          </div>

          <div
            key={`${cargo.id}-${slide.id}`}
            onClick={(e) => e.stopPropagation()}
            className="cursor-default rounded-2xl border border-white/10 bg-background p-5 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] ring-1 ring-white/5 animate-[slideFadeIn_500ms_ease-out] md:p-10"
          >
            {slide.render(cargo as never)}
          </div>

          <p className="mt-4 text-center text-[10px] uppercase tracking-[0.3em] text-white/40">
            Clique no fundo, use as setas ← → ou o player abaixo
          </p>
        </div>
      </main>

      <SlidePlayer
        index={safeIndex}
        total={total}
        onPrev={prev}
        onNext={next}
        onGo={go}
        slides={activeSlides.map((s) => ({ id: s.id, label: s.label, icon: s.icon }))}
      />

      <style>{`
        @keyframes slideFadeIn {
          0% { opacity: 0; transform: translateY(14px) scale(0.99); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}

function SlideTopBar({
  cargo,
  cargoId,
  setCargoId,
  index,
  total,
  slideLabel,
}: {
  cargo: AnyCargo;
  cargoId: string;
  setCargoId: (id: string) => void;
  index: number;
  total: number;
  slideLabel: string;
}) {
  const progress = ((index + 1) / total) * 100;
  return (
    <header
      onClick={(e) => e.stopPropagation()}
      className="relative z-20 flex flex-col gap-3 border-b border-white/10 bg-[#020617]/70 px-4 py-3 backdrop-blur-xl md:flex-row md:items-center md:justify-between md:gap-6 md:px-10 md:py-4"
    >
      <div className="flex items-center gap-3 md:gap-5">
        <img src={grouLogo} alt="Grou" className="h-6 w-auto brightness-0 invert md:h-7" />
        <span className="h-5 w-px bg-white/25" />
        <img src={gerdauLogoWhite} alt="Gerdau" className="h-6 w-auto object-contain md:h-8" />
      </div>

      <div className="hidden flex-1 items-center justify-center md:flex">
        <div className="flex items-center gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/55">
            People Analytics · Segurança
          </p>
          <span className="h-3 w-px bg-white/20" />
          <p className="text-sm font-semibold text-white">{slideLabel}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-3">
        <span className="hidden text-[10px] font-semibold uppercase tracking-[0.22em] text-white/60 md:inline">
          Cargo analisado →
        </span>
        <label className="relative flex flex-1 items-center md:flex-none">
          <span className="sr-only">Cargo</span>
          <select
            value={cargoId}
            onChange={(e) => setCargoId(e.target.value)}
            aria-label="Selecionar cargo"
            className="h-10 w-full appearance-none rounded-full border border-white/15 bg-white/5 pl-4 pr-9 text-xs font-semibold text-white shadow-sm backdrop-blur focus:outline-none focus:ring-2 focus:ring-white/30 md:w-auto md:min-w-[220px] md:text-sm"
          >
            {cargos.map((c) => (
              <option key={c.id} value={c.id} className="bg-[#020617] text-white">
                {c.nome}
              </option>
            ))}
            {cargosCompletos
              .filter((c) => !cargos.some((x) => x.id === c.id))
              .map((c) => (
                <option key={c.id} value={c.id} className="bg-[#020617] text-white">
                  {c.nome}
                </option>
              ))}
          </select>
          <svg
            aria-hidden
            viewBox="0 0 20 20"
            className="pointer-events-none absolute right-3 h-4 w-4 text-white/70"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 8l4 4 4-4" />
          </svg>
        </label>
        <button className="hidden h-10 shrink-0 items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-4 text-xs font-semibold text-white/85 backdrop-blur transition-colors hover:bg-white/10 md:inline-flex">
          <Download className="h-3.5 w-3.5" />
          Exportar
        </button>
      </div>

      {/* Progress bar */}
      <div className="absolute inset-x-0 bottom-0 h-[2px] bg-white/5">
        <div
          className="h-full bg-gradient-to-r from-[#9ec5ff] to-[#3658c1] transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      {/* Mobile slide label */}
      <p className="md:hidden text-[10px] font-semibold uppercase tracking-[0.22em] text-white/55">
        {cargo.periodo} · {slideLabel}
      </p>
    </header>
  );
}

function SlidePlayer({
  index,
  total,
  onPrev,
  onNext,
  onGo,
  slides,
}: {
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onGo: (i: number) => void;
  slides: { id: string; label: string; icon: typeof LayoutDashboard }[];
}) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-3 md:bottom-6"
    >
      <div className="flex w-full max-w-5xl flex-col gap-2 rounded-3xl border border-white/15 bg-[#020617]/90 p-2.5 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)] backdrop-blur-xl md:gap-2.5 md:p-3">
        {/* Top row: prev / play / next + counter */}
        <div className="flex items-center gap-2 md:gap-3">
          <button
            onClick={onPrev}
            aria-label="Slide anterior"
            className="group flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 text-xs font-semibold text-white/85 transition-colors hover:border-white/30 hover:bg-white/15 hover:text-white"
          >
            <ChevronLeft className="h-5 w-5 transition-transform group-hover:-translate-x-0.5" />
            <span className="hidden md:inline">Anterior</span>
          </button>

          <button
            onClick={onNext}
            aria-label="Próximo slide"
            className="group flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 text-xs font-semibold text-white transition-colors hover:border-white/40 hover:bg-white/20"
          >
            <span className="hidden md:inline">Próximo</span>
            <ChevronRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
          </button>

          <div className="flex flex-1 items-center gap-2 px-1">
            <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#9ec5ff] to-[#3658c1] transition-all duration-500"
                style={{ width: `${((index + 1) / total) * 100}%` }}
              />
            </div>
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-white/70">
              {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
            </span>
          </div>
        </div>

        {/* Bottom row: section tabs — clearly clickable, with scroll edge fades */}
        <div className="relative">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-[#020617] to-transparent"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-[#020617] to-transparent"
          />
          <div className="flex items-center gap-1.5 overflow-x-auto scroll-smooth px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {slides.map((s, i) => {
              const Icon = s.icon;
              const active = i === index;
              return (
                <button
                  key={s.id}
                  onClick={() => onGo(i)}
                  aria-current={active ? "true" : undefined}
                  title={`Ir para ${s.label}`}
                  className={`group flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold transition-all ${
                    active
                      ? "border-[#9ec5ff]/60 bg-[#9ec5ff]/15 text-white shadow-[0_0_0_3px_rgba(158,197,255,0.12)]"
                      : "border-white/10 bg-white/5 text-white/65 hover:border-white/25 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <span
                    className={`grid h-5 w-5 place-items-center rounded-full text-[10px] font-mono font-bold tabular-nums ${
                      active ? "bg-[#9ec5ff] text-[#020617]" : "bg-white/10 text-white/60"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <Icon className="h-3.5 w-3.5" />
                  <span>{s.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function Intro() {
  return (
    <section className="mb-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--gerdau-blue)]">
        Análise comportamental · Segurança do trabalho
      </p>
      <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-[var(--gerdau-blue)] md:text-5xl">
        Compatibilidade com o cargo × ocorrências de segurança
      </h1>
    </section>
  );
}

function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-1">
      <div className="flex items-center gap-3">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--gerdau-blue)]">
          {eyebrow}
        </span>
        <span className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
      </div>
      <h2 className="mt-1 font-display text-2xl font-bold tracking-tight">{title}</h2>
    </div>
  );
}

function DescricaoCargo({ cargo }: { cargo: CargoDataset }) {
  const [expanded, setExpanded] = useState(false);
  const limit = 280;
  const isLong = cargo.descricao.length > limit;
  const text = expanded || !isLong ? cargo.descricao : cargo.descricao.slice(0, limit).trimEnd() + "…";
  return (
    <Card className="border-[var(--gerdau-blue)]/15 bg-[var(--gerdau-blue)]/5 p-5 shadow-[var(--shadow-brand)]">
      <div className="grid gap-5 md:grid-cols-[1fr_auto]">
        <div>
          <div className="flex items-start justify-between gap-4">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--gerdau-blue)]">
              Descrição do cargo — {cargo.nome}
            </p>
            {isLong && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="shrink-0 text-xs font-semibold text-[var(--gerdau-blue)] hover:underline"
              >
                {expanded ? "Ver menos" : "Ver mais"}
              </button>
            )}
          </div>
          <p className="mt-3 text-sm leading-relaxed text-foreground/85">{text}</p>
        </div>
        <RepnaChart repna={cargo.repna} />
      </div>
    </Card>
  );
}

function RepnaChart({ repna }: { repna: { r: number; e: number; p: number; n: number; a: number } }) {
  const letters: { key: keyof typeof repna; label: string; color: string }[] = [
    { key: "r", label: "R", color: "#fa6f1d" },
    { key: "e", label: "E", color: "#F1C40F" },
    { key: "p", label: "P", color: "#2D7DD2" },
    { key: "n", label: "N", color: "#27AE60" },
    { key: "a", label: "A", color: "#8E44AD" },
  ];
  const W = 180;
  const H = 230;
  const padX = 32;
  const padY = 20;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;
  const xFor = (i: number) => padX + (innerW * (i + 0.5)) / letters.length;
  const yFor = (v: number) => padY + innerH * (1 - Math.max(0, Math.min(100, v)) / 100);
  const pts = letters.map((l, i) => ({
    x: xFor(i),
    y: yFor(repna[l.key]),
    ...l,
    v: repna[l.key],
  }));
  const pathD = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const r = 12;
  return (
    <div className="flex flex-col items-center">
      <p className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--gerdau-blue)]">
        REPNA — Perfil
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="overflow-visible">
        <defs>
          <clipPath id="repna-capsule">
            <rect x={padX - 14} y={padY - 6} width={innerW + 28} height={innerH + 12} rx={28} ry={28} />
          </clipPath>
        </defs>
        <rect
          x={padX - 14}
          y={padY - 6}
          width={innerW + 28}
          height={innerH + 12}
          rx={28}
          ry={28}
          fill="color-mix(in oklab, var(--gerdau-blue) 6%, white)"
          stroke="color-mix(in oklab, var(--gerdau-blue) 20%, white)"
          strokeWidth={1}
        />
        <g clipPath="url(#repna-capsule)">
          {[0, 25, 75, 100].map((g) => (
            <line
              key={g}
              x1={padX - 10}
              x2={padX + innerW + 10}
              y1={yFor(g)}
              y2={yFor(g)}
              stroke="color-mix(in oklab, var(--gerdau-blue) 25%, white)"
              strokeDasharray="2 3"
              strokeWidth={1}
            />
          ))}
          <line
            x1={padX - 10}
            x2={padX + innerW + 10}
            y1={yFor(50)}
            y2={yFor(50)}
            stroke="#E74C3C"
            strokeWidth={1.4}
          />
        </g>
        {[0, 50, 100].map((v) => (
          <text
            key={v}
            x={padX - 18}
            y={yFor(v) + 3}
            textAnchor="end"
            fontSize={9}
            fontFamily="ui-monospace, monospace"
            fill="color-mix(in oklab, var(--gerdau-blue) 60%, white)"
          >
            {v}
          </text>
        ))}
        <path
          d={pathD}
          fill="none"
          stroke="color-mix(in oklab, var(--gerdau-blue) 70%, white)"
          strokeWidth={1.4}
        />
        {pts.map((p) => (
          <g key={p.key}>
            <circle cx={p.x} cy={p.y} r={r} fill={p.color} />
            <text
              x={p.x}
              y={p.y + 4}
              textAnchor="middle"
              fontSize={12}
              fontWeight={700}
              fill="#fff"
              fontFamily="ui-sans-serif, system-ui"
            >
              {p.label}
            </text>
          </g>
        ))}
      </svg>
      <div className="mt-2 grid w-[180px] grid-cols-5 text-center">
        {pts.map((p) => (
          <div key={p.key} className="font-display text-xs font-bold text-foreground">
            {p.label}
          </div>
        ))}
        {pts.map((p) => (
          <div key={p.key + "v"} className="font-mono text-[10px] text-muted-foreground">
            {p.v}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- KPIs ---------------- */

function KpiCards({ cargo }: { cargo: CargoDataset }) {
  const stats = useMemo(() => {
    const all = cargo.colaboradores;
    const validos = all.filter((c) => !c.semDados);
    const totalOc = validos.reduce((sum, c) => sum + totalOcorrencias(c.ocorrencias), 0);
    const mediaCompat =
      all.reduce((s, c) => s + c.compatibilidade, 0) / all.length;
    const corr = pearson(
      validos.map((c) => c.compatibilidade),
      validos.map((c) => totalOcorrencias(c.ocorrencias)),
    );
    return { n: all.length, totalOc, mediaCompat, corr };
  }, [cargo]);

  return (
    <section
      className="mb-10 grid grid-cols-1 gap-4 md:grid-cols-3"
    >
      <Kpi label="Colaboradores" value={String(stats.n)} hint="analisados no cargo" />
      <Kpi
        label="Compatibilidade média"
        value={`${stats.mediaCompat.toFixed(0)}%`}
        hint="escala 0–100%"
      />
      <Kpi
        label="Total de ocorrências"
        value={String(stats.totalOc)}
        hint="soma do período"
      />
    </section>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "bad" | "neutral";
}) {
  const toneColor =
    tone === "good"
      ? "text-[var(--faixa-excelente)]"
      : tone === "bad"
        ? "text-[var(--faixa-baixa)]"
        : "text-foreground";
  return (
    <Card className="group relative overflow-hidden border-border/70 p-5 transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-brand)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--gerdau-blue)]/40 to-transparent" />
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className={`mt-3 font-display text-4xl font-bold tabular-nums ${toneColor}`}>
        {value}
      </p>
      {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

/* ---------------- Mensagem-chave (faixas) ---------------- */

function MensagemChave({ cargo }: { cargo: CargoDataset }) {
  const dados = useMemo(() => {
    return FAIXAS.map((f) => {
      const grupo = cargo.colaboradores.filter(
        (c) => getFaixa(c.compatibilidade) === f.key,
      );
      const comDados = grupo.filter((c) => !c.semDados);
      const media =
        comDados.length === 0
          ? 0
          : comDados.reduce((s, c) => s + totalOcorrencias(c.ocorrencias), 0) /
            comDados.length;
      return { ...f, n: grupo.length, media };
    });
  }, [cargo]);

  const maxMedia = Math.max(...dados.map((d) => d.media), 1);

  return (
    <section className="mb-12">
      <div
        className="relative overflow-hidden rounded-2xl border border-border/60 p-6 text-white shadow-[var(--shadow-brand)] md:p-8"
        style={{ backgroundImage: "var(--gradient-brand)", backgroundColor: "var(--gerdau-blue-dark)" }}
      >
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[var(--gerdau-blue-light)]/40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-10 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="relative">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">
            Mensagem-chave
          </p>
          <h2 className="mt-2 font-display text-2xl font-bold md:text-3xl">
            A média de ocorrências cai conforme a compatibilidade sobe.
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-white/80">
            Média de ocorrências de segurança por faixa de compatibilidade
            comportamental.
          </p>
        </div>

        <div className="relative mt-7 grid grid-cols-1 gap-3 md:grid-cols-4">
        {dados.map((d) => {
            const widthPct = d.media === 0 ? 4 : 12 + (d.media / maxMedia) * 88;
            return (
              <div
                key={d.key}
                className="flex h-full flex-col rounded-xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm"
              >
                <div className="flex items-baseline justify-between">
                  <p className="text-sm font-semibold text-white">{d.label}</p>
                  <span className="rounded-full bg-white/15 px-2 py-0.5 font-mono text-[10px] text-white/85">
                    {faixaRangeLabel(d.key)}
                  </span>
                </div>
                <div className="mt-3 flex items-end gap-2">
                  <p className="font-display text-4xl font-bold leading-none tabular-nums text-white">
                    {d.media.toFixed(1)}
                  </p>
                  <p className="pb-1 text-[11px] text-white/70">média ocor.</p>
                </div>
                <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/15">
                  <div
                    className="h-full rounded-full bg-white transition-all"
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
                <p className="mt-3 font-mono text-[10px] uppercase tracking-wider text-white/70">
                  {d.n} {d.n === 1 ? "colaborador" : "colaboradores"}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function faixaRangeLabel(f: Faixa) {
  switch (f) {
    case "excelente":
      return "≥ 90";
    case "muitoBoa":
      return "80–89";
    case "aceitavel":
      return "60–79";
    case "baixa":
      return "< 60";
  }
}

/* ---------------- Ranking com barras ---------------- */

function Ranking({ cargo }: { cargo: CargoDataset }) {
  const ordenado = useMemo(
    () => [...cargo.colaboradores].sort((a, b) => b.compatibilidade - a.compatibilidade),
    [cargo],
  );
  const maxOc = Math.max(
    1,
    ...cargo.colaboradores.map((c) =>
      c.semDados ? 0 : totalOcorrencias(c.ocorrencias),
    ),
  );

  return (
    <section className="mb-12">
      <SectionHeader
        eyebrow="Ranking"
        title="Compatibilidade por colaborador"
      />
      <p className="mb-5 text-sm text-muted-foreground">
        Colaboradores ordenados do maior para o menor índice de compatibilidade,
        com o total de ocorrências registradas no período.
      </p>
      <Card className="divide-y divide-border/70 p-0 shadow-[var(--shadow-brand)]">
        {ordenado.map((c) => (
          <RankingRow key={c.nome} c={c} maxOc={maxOc} />
        ))}
      </Card>
    </section>
  );
}

function RankingRow({ c, maxOc }: { c: Colaborador; maxOc: number }) {
  const faixa = getFaixa(c.compatibilidade);
  const faixaInfo = FAIXAS.find((f) => f.key === faixa)!;
  const total = c.semDados ? 0 : totalOcorrencias(c.ocorrencias);

  return (
    <div className="grid grid-cols-12 items-center gap-4 px-5 py-4">
      <div className="col-span-12 md:col-span-3">
        <p className="text-sm font-medium">{c.nome}</p>
        <p className="text-xs text-muted-foreground">
          Empresa: {c.tempoGerdau} · Liderança: {c.tempoLideranca}
        </p>
      </div>

      <div className="col-span-6 md:col-span-3">
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-xs text-muted-foreground">Compatibilidade</span>
          <span className="text-sm font-semibold tabular-nums">
            {c.compatibilidade}%
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full"
            style={{
              width: `${c.compatibilidade}%`,
              background: `var(--${faixaInfo.token})`,
            }}
          />
        </div>
      </div>

      <div className="col-span-6 md:col-span-3">
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-xs text-muted-foreground">Ocorrências</span>
          <span className="text-sm font-semibold tabular-nums">
            {c.semDados ? "—" : total}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full"
            style={{
              width: c.semDados ? "0%" : `${(total / maxOc) * 100}%`,
              background: "var(--faixa-baixa)",
              opacity: total === 0 ? 0 : 1,
            }}
          />
        </div>
      </div>

      <div className="col-span-12 flex flex-wrap gap-1.5 md:col-span-3 md:justify-end">
        {c.semDados ? (
          <Badge variant="outline" className="text-xs">
            Sem dados de ocorrências
          </Badge>
        ) : (
          TIPOS_OCORRENCIA.map((t) => {
            const v = c.ocorrencias[t.key] ?? 0;
            if (v === 0) return null;
            return (
              <span
                key={t.key}
                title={t.desc}
                className="rounded-md border border-border px-2 py-0.5 text-xs font-medium tabular-nums"
              >
                {t.label} {v}
              </span>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ---------------- Heatmap ---------------- */

function Heatmap({ cargo }: { cargo: CargoDataset }) {
  const ordenado = useMemo(
    () => [...cargo.colaboradores].sort((a, b) => b.compatibilidade - a.compatibilidade),
    [cargo],
  );
  const maxByTipo = useMemo(() => {
    const m: Record<TipoOcorrenciaKey, number> = {
      cpt: 1, spt: 1, cdmA: 1, qaA: 1, sancoes: 1,
    };
    cargo.colaboradores.forEach((c) => {
      if (c.semDados) return;
      TIPOS_OCORRENCIA.forEach((t) => {
        const v = c.ocorrencias[t.key] ?? 0;
        if (v > m[t.key]) m[t.key] = v;
      });
    });
    return m;
  }, [cargo]);

  return (
    <section className="mb-12">
      <SectionHeader eyebrow="Heatmap" title="Ocorrências por tipo" />
      <p className="mb-5 text-sm text-muted-foreground">
        Concentração de ocorrências por colaborador e tipo. Quanto mais escura a
        célula, maior a contagem.
      </p>
      <Card className="overflow-x-auto p-0 shadow-[var(--shadow-brand)]">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Colaborador
              </th>
              {TIPOS_OCORRENCIA.map((t) => (
                <th
                  key={t.key}
                  className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  title={t.desc}
                >
                  {t.label}
                </th>
              ))}
              <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {ordenado.map((c) => {
              const total = c.semDados ? 0 : totalOcorrencias(c.ocorrencias);
              return (
                <tr key={c.nome} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{
                          background: `var(--${FAIXAS.find((f) => f.key === getFaixa(c.compatibilidade))!.token})`,
                        }}
                      />
                      <span className="font-medium">{c.nome}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {c.compatibilidade}%
                      </span>
                    </div>
                  </td>
                  {TIPOS_OCORRENCIA.map((t) => {
                    const v = c.ocorrencias[t.key];
                    return (
                      <td key={t.key} className="px-2 py-1.5 text-center">
                        <HeatCell value={v} max={maxByTipo[t.key]} />
                      </td>
                    );
                  })}
                  <td className="px-3 py-2.5 text-center text-sm font-semibold tabular-nums">
                    {c.semDados ? "—" : total}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </section>
  );
}

function HeatCell({ value, max }: { value: number | null; max: number }) {
  if (value === null) {
    return (
      <div className="mx-auto flex h-9 w-12 items-center justify-center rounded text-xs text-muted-foreground" style={{ background: "color-mix(in oklab, var(--faixa-sem-dados) 12%, transparent)" }}>
        —
      </div>
    );
  }
  const intensity = value === 0 ? 0 : 0.18 + (value / max) * 0.7;
  return (
    <div
      className="mx-auto flex h-9 w-12 items-center justify-center rounded text-sm font-semibold tabular-nums"
      style={{
        background:
          value === 0
            ? "color-mix(in oklab, var(--muted) 50%, transparent)"
            : `color-mix(in oklab, var(--faixa-baixa) ${(intensity * 100).toFixed(0)}%, transparent)`,
        color: intensity > 0.55 ? "white" : "inherit",
      }}
    >
      {value}
    </div>
  );
}

/* ---------------- Comparativo agrupado ---------------- */

function ComparativoFaixas({ cargo }: { cargo: CargoDataset }) {
  const data = useMemo(() => {
    return FAIXAS.map((f) => {
      const grupo = cargo.colaboradores.filter(
        (c) => !c.semDados && getFaixa(c.compatibilidade) === f.key,
      );
      const avg = (key: TipoOcorrenciaKey) =>
        grupo.length === 0
          ? 0
          : grupo.reduce((s, c) => s + (c.ocorrencias[key] ?? 0), 0) /
            grupo.length;
      return {
        faixa: f.label,
        CPT: +avg("cpt").toFixed(2),
        SPT: +avg("spt").toFixed(2),
        "CDM-A": +avg("cdmA").toFixed(2),
        "QA-A": +avg("qaA").toFixed(2),
        Sanções: +avg("sancoes").toFixed(2),
      };
    });
  }, [cargo]);

  return (
    <section className="mb-12">
      <SectionHeader
        eyebrow="Comparativo"
        title="Média por tipo e faixa"
      />
      <p className="mb-5 text-sm text-muted-foreground">
        Média de ocorrências por tipo, em cada faixa de compatibilidade.
      </p>
      <Card className="p-5 shadow-[var(--shadow-brand)]">
        <div className="h-[340px] w-full">
          <ResponsiveContainer>
            <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis dataKey="faixa" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals />
              <RTooltip
                contentStyle={{
                  background: "var(--background)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="CPT" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="SPT" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="CDM-A" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="QA-A" fill="var(--chart-4)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Sanções" fill="var(--chart-5)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </section>
  );
}

/* ---------------- Tabela detalhada ---------------- */

function TabelaDetalhada({ cargo }: { cargo: CargoDataset }) {
  return (
    <section className="mb-12">
      <SectionHeader eyebrow="Base bruta" title="Dados detalhados" />
      <p className="mb-5 text-sm text-muted-foreground">
        Base bruta utilizada nesta análise.
      </p>
      <Card className="overflow-x-auto p-0 shadow-[var(--shadow-brand)]">
        <table className="w-full min-w-[800px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3 text-left">Nome</th>
              <th className="px-3 py-3 text-center">Compat.</th>
              <th className="px-3 py-3 text-left">Tempo Empresa</th>
              <th className="px-3 py-3 text-left">Tempo Liderança</th>
              {TIPOS_OCORRENCIA.map((t) => (
                <th key={t.key} className="px-3 py-3 text-center" title={t.desc}>
                  {t.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cargo.colaboradores.map((c) => (
              <tr
                key={c.nome}
                className={`border-b border-border last:border-0 ${c.semDados ? "text-muted-foreground" : ""}`}
              >
                <td className="px-4 py-2.5 font-medium">{c.nome}</td>
                <td className="px-3 py-2.5 text-center tabular-nums">{c.compatibilidade}%</td>
                <td className="px-3 py-2.5">{c.tempoGerdau}</td>
                <td className="px-3 py-2.5">{c.tempoLideranca}</td>
                {TIPOS_OCORRENCIA.map((t) => (
                  <td key={t.key} className="px-3 py-2.5 text-center tabular-nums">
                    {c.ocorrencias[t.key] === null ? "Sem dados" : c.ocorrencias[t.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </section>
  );
}

/* ---------------- utils ---------------- */

function pearson(x: number[], y: number[]): number {
  const n = x.length;
  return _pearson(x, y, n);
}

/* ---------------- Trainee — layout diferenciado ---------------- */

function TraineeAnalise({ cargo }: { cargo: TraineeDataset }) {
  const avaliacoes = useMemo(
    () => [...cargo.avaliacoes].sort((a, b) => b.compatibilidade - a.compatibilidade),
    [cargo],
  );

  return (
    <section className="space-y-7">
      {/* Header do candidato */}
      <div
        className="relative overflow-hidden rounded-2xl border border-[var(--gerdau-blue)]/15 p-6 text-white shadow-[var(--shadow-brand)] md:p-7"
        style={{
          backgroundImage: "var(--gradient-brand)",
          backgroundColor: "var(--gerdau-blue-dark)",
        }}
      >
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[var(--gerdau-blue-light)]/40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-white/10 blur-3xl" />

        <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/70">
                Trainee · Análise de compatibilidade com cargos
              </p>
              <h2 className="mt-1 font-display text-2xl font-bold leading-tight md:text-3xl">
                {cargo.colaborador.nome}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
                  <Clock className="h-3.5 w-3.5" />
                  {cargo.colaborador.tempoGerdau} de empresa
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
                  <User className="h-3.5 w-3.5" />
                  Avaliado em {cargo.avaliacoes.length} cargos
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-white/20 bg-white/95 p-4 backdrop-blur">
            <RepnaChart repna={cargo.repna} />
          </div>
        </div>
      </div>

      {/* Gráfico de barras comparativo */}
      <div>
        <SectionHeader
          eyebrow="Compatibilidade por cargo"
          title="Aderência comportamental"
        />
        <p className="mb-5 mt-1 text-sm text-muted-foreground">
          Percentual de compatibilidade do colaborador com cada um dos cargos avaliados (escala 0–100%).
        </p>
        <Card className="space-y-5 p-5 shadow-[var(--shadow-brand)] md:p-6">
          {avaliacoes.map((a) => {
            const faixa = getFaixa(a.compatibilidade);
            const faixaInfo = FAIXAS.find((f) => f.key === faixa)!;
            return (
              <div key={a.cargoId}>
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">{a.cargoNome}</p>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-lg font-bold tabular-nums text-foreground">
                      {a.compatibilidade}%
                    </span>
                  </div>
                </div>
                <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${a.compatibilidade}%`,
                      background: `var(--${faixaInfo.token})`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </Card>
      </div>

      {/* Recomendações por cargo */}
      <div>
        <SectionHeader
          eyebrow="Desenvolvimento"
          title="Recomendações por cargo"
        />
        <p className="mb-5 mt-1 text-sm text-muted-foreground">
          Direcionadores comportamentais sugeridos para o trainee em cada cenário.
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          {avaliacoes.map((a) => {
            const faixa = getFaixa(a.compatibilidade);
            const faixaInfo = FAIXAS.find((f) => f.key === faixa)!;
            return (
              <Card
                key={a.cargoId}
                className="flex h-full flex-col gap-3 border-border bg-card p-5 shadow-[var(--shadow-brand)]"
              >
                <div
                  className="absolute left-0 top-0 h-1 w-full rounded-t-xl"
                  style={{ background: `var(--${faixaInfo.token})` }}
                />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-display text-base font-bold leading-tight text-foreground">
                      {a.cargoNome}
                    </p>
                  </div>
                  <span
                    className="shrink-0 rounded-md px-2 py-1 font-mono text-xs font-bold tabular-nums"
                    style={{
                      backgroundColor: `color-mix(in oklab, var(--${faixaInfo.token}) 18%, transparent)`,
                      color: `var(--${faixaInfo.token})`,
                    }}
                  >
                    {a.compatibilidade}%
                  </span>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                  <p className="text-sm leading-relaxed text-foreground/85">
                    {a.recomendacao}
                  </p>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Recomendacoes({ cargo }: { cargo: CargoDataset }) {
  const lista = useMemo(
    () =>
      [...cargo.colaboradores]
        .filter((c) => c.recomendacao)
        .sort((a, b) => b.compatibilidade - a.compatibilidade),
    [cargo],
  );

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
            Desenvolvimento
          </p>
          <h2 className="font-display text-2xl font-bold text-foreground">
            Recomendações de desenvolvimento
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Direcionadores comportamentais sugeridos para cada colaborador,
            ordenados pela compatibilidade com o cargo.
          </p>
        </div>
        <Badge variant="outline" className="hidden md:inline-flex">
          {lista.length} colaboradores
        </Badge>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {lista.map((c) => {
          const faixa = getFaixa(c.compatibilidade);
          return (
            <Card
              key={c.nome}
              className="flex flex-col gap-3 border-border bg-card p-4 shadow-[var(--shadow-brand)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {c.nome}
                  </p>
                </div>
                <span
                  className="rounded-md px-2 py-1 font-mono text-xs font-bold tabular-nums"
                  style={{
                    backgroundColor: `color-mix(in oklab, var(--${FAIXAS.find((f) => f.key === faixa)?.token}) 18%, transparent)`,
                    color: `var(--${FAIXAS.find((f) => f.key === faixa)?.token})`,
                  }}
                >
                  {c.compatibilidade}%
                </span>
              </div>
              <p className="text-sm leading-relaxed text-foreground/85">
                {c.recomendacao}
              </p>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function _pearson(x: number[], y: number[], n: number): number {
  if (n === 0) return 0;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let num = 0,
    dx = 0,
    dy = 0;
  for (let i = 0; i < n; i++) {
    const a = x[i] - mx;
    const b = y[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? 0 : num / den;
}
