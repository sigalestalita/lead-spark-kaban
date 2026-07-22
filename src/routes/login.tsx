import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import lidiLogo from "@/assets/lidi-logo-white.png";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Entrar — COMPASS" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" ? s.next : undefined,
  }),
  component: LoginPage,
});

function isSafeNext(next: string | undefined): next is string {
  return !!next && next.startsWith("/") && !next.startsWith("//");
}

function LoginPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"sdr" | "executivo" | "gestao">("sdr");
  const [loading, setLoading] = useState(false);

  const destination = isSafeNext(next) ? next : "/kanban";

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) window.location.href = destination;
    });
  }, [destination]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Bem-vindo!");
        window.location.href = destination;
      } else {
        if (!/@grougp\.com\.br$/i.test(email.trim())) {
          throw new Error("Cadastro restrito a emails @grougp.com.br");
        }
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}${destination}`,
            data: { full_name: name, role },
          },
        });
        if (error) throw error;
        toast.success("Cadastro feito! Verifique seu email para confirmar.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao autenticar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen grid place-items-center px-4 overflow-hidden bg-[oklch(0.11_0.03_265)]">
      {/* Video background */}
      <video
        aria-hidden
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        className="pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover opacity-90"
        src="/login-bg.mp4"
      />
      {/* Aurora background (fallback + extra depth) */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 mix-blend-screen">
        <div className="absolute -top-40 -left-40 h-[55vw] w-[55vw] rounded-full blur-[140px] opacity-60 animate-[aurora1_14s_ease-in-out_infinite] bg-[oklch(0.55_0.22_260/0.55)]" />
        <div className="absolute -bottom-40 -right-40 h-[55vw] w-[55vw] rounded-full blur-[140px] opacity-50 animate-[aurora2_18s_ease-in-out_infinite] bg-[oklch(0.78_0.13_215/0.45)]" />
        <div className="absolute top-1/3 left-1/2 h-[35vw] w-[35vw] -translate-x-1/2 rounded-full blur-[120px] opacity-40 animate-[aurora3_22s_ease-in-out_infinite] bg-[oklch(0.65_0.22_310/0.35)]" />
      </div>
      {/* Darken overlay for form contrast */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-black/40" />
      <Card className="relative w-full max-w-md p-8 border-white/10 bg-white/[0.06] backdrop-blur-2xl shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)] animate-[loginIn_700ms_cubic-bezier(0.22,1,0.36,1)_both]">
        <div className="flex flex-col items-center text-center gap-3 mb-8">
          <div className="flex items-center gap-3">
            <img src={lidiLogo} alt="Grou" className="h-10 w-auto" />
            <span className="text-2xl font-bold tracking-[0.35em] text-white">COMPASS</span>
          </div>
          <p className="text-xs text-muted-foreground">CRM da Grou · Qualificação de leads e operação comercial</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          {mode === "signup" && (
            <div>
              <Label htmlFor="name">Nome completo</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
          )}
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            {mode === "signup" && (
              <p className="text-xs text-muted-foreground mt-1">
                Cadastro restrito ao time Grou (@grougp.com.br)
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="password">Senha</Label>
            <Input id="password" type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {mode === "signup" && (
            <div>
              <Label>Qual é o seu papel?</Label>
              <RadioGroup
                value={role}
                onValueChange={(v) => setRole(v as "sdr" | "executivo" | "gestao")}
                className="mt-2 grid grid-cols-3 gap-2"
              >
                {[
                  { v: "sdr", label: "SDR" },
                  { v: "executivo", label: "Executivo" },
                  { v: "gestao", label: "Gestão" },
                ].map((opt) => (
                  <label
                    key={opt.v}
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer text-sm ${
                      role === opt.v
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-white/10 text-muted-foreground hover:border-white/20"
                    }`}
                  >
                    <RadioGroupItem value={opt.v} id={`role-${opt.v}`} />
                    {opt.label}
                  </label>
                ))}
              </RadioGroup>
            </div>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar conta"}
          </Button>
        </form>
        <p className="text-xs text-center text-muted-foreground mt-4">
          {mode === "login" ? "Sem conta? " : "Já tem conta? "}
          <button onClick={() => setMode(mode === "login" ? "signup" : "login")} className="text-primary font-semibold hover:underline">
            {mode === "login" ? "Cadastre-se" : "Entre"}
          </button>
        </p>
      </Card>
    </div>
  );
}
