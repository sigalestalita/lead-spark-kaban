import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listLeadsTool from "./tools/list-leads";
import getLeadTool from "./tools/get-lead";
import dashboardStatsTool from "./tools/dashboard-stats";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "compass-mcp",
  title: "COMPASS CRM",
  version: "0.1.0",
  instructions:
    "Ferramentas do COMPASS (CRM da Grou) para consultar leads, obter detalhes de um lead e resumo de funil. Todas as chamadas respeitam a identidade e permissões do usuário autenticado.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listLeadsTool, getLeadTool, dashboardStatsTool],
});
