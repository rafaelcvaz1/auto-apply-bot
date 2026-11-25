import { mcpToTool, type GenerateContentConfig } from '@google/genai';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { customToolDeclarations } from './tools.js';
import type { AgenteConfig, Perfil, SitesConfig } from './types.js';

// Compatibility exports for legacy tests. The autonomous agent is disabled.
export function construirConfigGeracao(
  mcpClient: Client,
  systemPrompt: string,
): GenerateContentConfig {
  return {
    systemInstruction: systemPrompt,
    automaticFunctionCalling: { disable: true },
    tools: [
      mcpToTool(mcpClient),
      { functionDeclarations: customToolDeclarations },
    ],
  };
}

/** Legacy automation is deliberately unavailable in the search-only application. */
export async function executarAgente(
  _mcpClient: Client, _perfil: Perfil, _sites: SitesConfig, _config: AgenteConfig,
): Promise<string> {
  throw new Error('Automação de candidaturas desativada. Use o painel de busca e revisão.');
}
