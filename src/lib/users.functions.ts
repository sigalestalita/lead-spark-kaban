import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const TALITA_EMAIL = "talita.sigales@grougp.com.br";

const RoleSchema = z.enum(["super_admin", "gestao", "executivo", "sdr"]);

async function getCallerRole(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r) => r.role as string);
  return {
    isSuperAdmin: roles.includes("super_admin"),
    isGestao: roles.includes("gestao"),
    roles,
  };
}

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const caller = await getCallerRole(context.userId);
    if (!caller.isSuperAdmin && !caller.isGestao) {
      throw new Error("Acesso negado");
    }

    const { data: profiles, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, created_at")
      .order("created_at", { ascending: false });
    if (pErr) throw new Error(pErr.message);

    const { data: roles, error: rErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role");
    if (rErr) throw new Error(rErr.message);

    const roleByUser = new Map<string, string>();
    for (const r of roles ?? []) roleByUser.set(r.user_id as string, r.role as string);

    return {
      canEdit: caller.isSuperAdmin,
      currentUserId: context.userId,
      users: (profiles ?? []).map((p) => ({
        id: p.id as string,
        email: (p.email as string) ?? "",
        full_name: (p.full_name as string) ?? "",
        created_at: p.created_at as string,
        role: roleByUser.get(p.id as string) ?? null,
      })),
    };
  });

export const updateUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ userId: z.string().uuid(), role: RoleSchema }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const caller = await getCallerRole(context.userId);
    if (!caller.isSuperAdmin) throw new Error("Apenas super admin pode alterar papéis");

    // Proteger a Talita: não rebaixar
    const { data: target } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", data.userId)
      .maybeSingle();
    if (target?.email && (target.email as string).toLowerCase() === TALITA_EMAIL && data.role !== "super_admin") {
      throw new Error("Não é permitido alterar o papel da super admin principal");
    }

    const { error: delErr } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId);
    if (delErr) throw new Error(delErr.message);

    const { error: insErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.role });
    if (insErr) throw new Error(insErr.message);

    return { ok: true };
  });

export const removeUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const caller = await getCallerRole(context.userId);
    if (!caller.isSuperAdmin) throw new Error("Apenas super admin pode remover usuários");
    if (data.userId === context.userId) throw new Error("Você não pode remover a si mesmo");

    const { data: target } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", data.userId)
      .maybeSingle();
    if (target?.email && (target.email as string).toLowerCase() === TALITA_EMAIL) {
      throw new Error("Não é permitido remover a super admin principal");
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMyRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    const roles = (data ?? []).map((r) => r.role as string);
    return {
      roles,
      role: roles[0] ?? null,
      isSuperAdmin: roles.includes("super_admin"),
      isGestao: roles.includes("gestao"),
    };
  });