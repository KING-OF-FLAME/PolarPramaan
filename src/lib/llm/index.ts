// Optional LLM provider adapter (Anthropic Claude API). Disabled unless
// LLM_API_KEY and LLM_MODEL are configured; callers must handle `unavailable`
// and never substitute a manufactured answer.
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type * as z from 'zod/v4';

export type LlmResult<T> =
  | { ok: true; value: T; model: string }
  | { ok: false; reason: 'unavailable' | 'refused' | 'provider_error' | 'invalid_output'; message: string };

export function llmStatus(): { configured: boolean; model: string | null; provider: string } {
  const configured = !!(process.env.LLM_API_KEY && process.env.LLM_MODEL);
  return { configured, model: configured ? process.env.LLM_MODEL! : null, provider: process.env.LLM_PROVIDER || 'anthropic' };
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.LLM_API_KEY, timeout: 90_000, maxRetries: 1 });
  return client;
}

export async function generateStructured<S extends z.ZodType>(opts: {
  schema: S;
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<LlmResult<z.infer<S>>> {
  const st = llmStatus();
  if (!st.configured) return { ok: false, reason: 'unavailable', message: 'No AI provider is configured (LLM_API_KEY / LLM_MODEL).' };
  if (st.provider !== 'anthropic') return { ok: false, reason: 'unavailable', message: `LLM provider "${st.provider}" is not implemented.` };
  try {
    const res = await getClient().messages.parse({
      model: st.model!,
      max_tokens: opts.maxTokens ?? 8000,
      system: opts.system,
      messages: [{ role: 'user', content: opts.user }],
      output_config: { format: zodOutputFormat(opts.schema) },
    });
    if (res.stop_reason === 'refusal') return { ok: false, reason: 'refused', message: 'The AI provider declined this request.' };
    if (res.parsed_output == null) return { ok: false, reason: 'invalid_output', message: 'The AI provider returned output that did not match the required schema.' };
    return { ok: true, value: res.parsed_output as z.infer<S>, model: res.model };
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return { ok: false, reason: 'provider_error', message: 'AI provider rate limit reached; try again later.' };
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, reason: 'provider_error', message: 'AI provider rejected the configured credentials.' };
    if (e instanceof Anthropic.APIError) return { ok: false, reason: 'provider_error', message: `AI provider error (${e.status ?? 'network'}).` };
    return { ok: false, reason: 'provider_error', message: 'AI provider request failed.' };
  }
}
