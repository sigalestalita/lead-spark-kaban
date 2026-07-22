import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyRole } from "@/lib/users.functions";
import { useAuth } from "@/lib/use-auth";

export function useCurrentRole() {
  const { user, loading: authLoading } = useAuth();
  const fn = useServerFn(getMyRole);
  const { data, isLoading } = useQuery({
    queryKey: ["my-role", user?.id],
    queryFn: () => fn(),
    enabled: !!user,
    staleTime: 60_000,
  });
  return {
    role: data?.role ?? null,
    isSuperAdmin: !!data?.isSuperAdmin,
    isGestao: !!data?.isGestao,
    isComercial: !!data?.isComercial,
    isCs: !!data?.isCs,
    isFinanceiro: !!data?.isFinanceiro,
    loading: authLoading || isLoading,
  };
}