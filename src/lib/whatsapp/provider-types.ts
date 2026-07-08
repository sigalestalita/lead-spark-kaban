// Interface única para todos os provedores de WhatsApp (Evolution, Z-API, Meta, mock, etc).
// A camada de envio/recebimento é desacoplada do CRM — para plugar um BSP novo,
// implemente esta interface e registre em provider-registry.server.ts.

export type WaMessageType = "text" | "image" | "file" | "audio" | "video" | "template";

export interface WaAccountConfig {
  id: string;
  phone_number: string;
  provider: string;
  provider_instance_id: string | null;
  provider_base_url: string | null;
  access_token: string | null;
  webhook_secret: string;
}

export interface WaSendInput {
  account: WaAccountConfig;
  to: string; // E.164
  type: WaMessageType;
  body?: string;
  mediaUrl?: string;
  mediaMime?: string;
  templateName?: string;
  templateLanguage?: string;
  /** Parâmetros posicionais do cabeçalho do template HSM (HEADER {{1}}, {{2}}, …). */
  templateHeaderParams?: string[];
  /** Parâmetros posicionais do corpo do template HSM ({{1}}, {{2}}, …). */
  templateParams?: string[];
  /** Compat: chave→valor; convertido em posicional ordenando as chaves. */
  templateVariables?: Record<string, string>;
}

export interface WaSendResult {
  providerMessageId: string;
  status: "sending" | "sent" | "failed";
  error?: string;
}

export interface WaInboundMessage {
  providerMessageId: string;
  from: string; // E.164
  to: string;
  type: WaMessageType;
  body?: string;
  mediaId?: string;
  mediaUrl?: string;
  mediaMime?: string;
  timestamp: number; // ms
  senderName?: string;
}

export interface WaStatusUpdate {
  providerMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  error?: string;
  timestamp: number;
}

export type WaWebhookEvent =
  | { kind: "message"; data: WaInboundMessage }
  | { kind: "status"; data: WaStatusUpdate };

export interface WhatsAppProvider {
  readonly id: string;
  sendMessage(input: WaSendInput): Promise<WaSendResult>;
  parseWebhook(rawBody: string, headers: Record<string, string>, account: WaAccountConfig): WaWebhookEvent[];
  verifySignature?(rawBody: string, headers: Record<string, string>, secret: string): boolean;
}