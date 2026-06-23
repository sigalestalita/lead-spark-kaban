// Provedor MOCK: usado em desenvolvimento. "Envia" loggando no console
// e o webhook /api/public/whatsapp/webhook/$accountId pode ser chamado
// manualmente para simular mensagens recebidas.
import type { WhatsAppProvider, WaSendInput, WaSendResult, WaWebhookEvent } from "./provider-types";

export const mockProvider: WhatsAppProvider = {
  id: "mock",
  async sendMessage(input: WaSendInput): Promise<WaSendResult> {
    const id = `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    console.log("[WA mock] send", { to: input.to, type: input.type, body: input.body?.slice(0, 80) });
    return { providerMessageId: id, status: "sent" };
  },
  parseWebhook(rawBody): WaWebhookEvent[] {
    try {
      const payload = JSON.parse(rawBody) as {
        events?: WaWebhookEvent[];
        kind?: string;
        data?: unknown;
      };
      if (Array.isArray(payload.events)) return payload.events;
      if (payload.kind && payload.data) return [payload as WaWebhookEvent];
      return [];
    } catch {
      return [];
    }
  },
};