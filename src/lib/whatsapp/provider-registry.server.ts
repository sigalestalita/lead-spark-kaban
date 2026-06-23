import type { WhatsAppProvider } from "./provider-types";
import { mockProvider } from "./mock-provider.server";
import { metaCloudProvider } from "./meta-cloud-provider.server";

// Registry de providers. Para plugar Evolution/Z-API/Meta:
// 1. crie src/lib/whatsapp/<provider>-provider.server.ts implementando WhatsAppProvider
// 2. importe e registre aqui
const providers: Record<string, WhatsAppProvider> = {
  mock: mockProvider,
  meta_cloud: metaCloudProvider,
};

export function getProvider(name: string): WhatsAppProvider {
  const p = providers[name];
  if (!p) throw new Error(`WhatsApp provider not implemented: ${name}`);
  return p;
}

export function listProviders(): string[] {
  return Object.keys(providers);
}