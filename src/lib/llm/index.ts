// Optional LLM provider adapter (Anthropic Claude API). Disabled unless
// LLM_API_KEY and LLM_MODEL are configured; callers must handle `unavailable`
// and never substitute a manufactured answer.
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type * as z from 'zod/v4';

export type LlmResult<T> =
  | { ok: true; value: T; model: string }
  | { ok: false; reason: 'unavailable' | 'refused' | 'provider_error' | 'invalid_output'; message: string };

export function llmStatus(): { configured: boolean; model: string | null; provider: string; problem?: string } {
  const provider = process.env.LLM_PROVIDER || 'anthropic';
  const model = process.env.LLM_MODEL || null;
  const has = !!(process.env.LLM_API_KEY && model);
  // OpenRouter is restricted to free models (":free" suffix) by project policy.
  if (has && provider === 'openrouter' && !model!.endsWith(':free')) {
    return { configured: false, model: null, provider, problem: `LLM_MODEL "${model}" is not a free OpenRouter model (must end in ":free").` };
  }
  return { configured: has, model: has ? model : null, provider };
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
  if (st.provider === 'openrouter') return openRouterStructured(opts, st.model!);
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

/** Extract the first top-level JSON object from model text (free models may wrap JSON in prose or fences). */
export function firstJsonObject(text: string): unknown {
  const start = text.indexOf('{');
  if (start < 0) throw new Error('no JSON object');
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return JSON.parse(text.slice(start, i + 1));
  }
  throw new Error('unterminated JSON object');
}

// OpenRouter (OpenAI-compatible chat completions), free models only.
async function openRouterStructured<S extends z.ZodType>(opts: { schema: S; system: string; user: string; maxTokens?: number }, model: string): Promise<LlmResult<z.infer<S>>> {
  if (!model.endsWith(':free')) return { ok: false, reason: 'unavailable', message: 'Only free OpenRouter models are allowed.' };
  const { toJSONSchema } = await import('zod/v4');
  const schema = toJSONSchema(opts.schema);
  const system = `${opts.system}\n\nRespond with a single JSON object only, matching this JSON Schema:\n${JSON.stringify(schema)}`;
  let res: Response;
  try {
    res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: AbortSignal.timeout(60_000),
      headers: {
        authorization: `Bearer ${process.env.LLM_API_KEY}`,
        'content-type': 'application/json',
        'x-title': 'PolarPramaan (SIH26063)',
        ...(process.env.NEXT_PUBLIC_APP_URL ? { 'http-referer': process.env.NEXT_PUBLIC_APP_URL } : {}),
      },
      body: JSON.stringify({
        model,
        max_tokens: opts.maxTokens ?? 4000,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: opts.user },
        ],
      }),
    });
  } catch {
    return { ok: false, reason: 'provider_error', message: 'AI provider request failed or timed out.' };
  }
  if (res.status === 429) return { ok: false, reason: 'provider_error', message: 'Free AI model rate limit reached; try again later.' };
  if (res.status === 401 || res.status === 403) return { ok: false, reason: 'provider_error', message: 'AI provider rejected the configured credentials.' };
  if (!res.ok) return { ok: false, reason: 'provider_error', message: `AI provider error (${res.status}).` };
  let content = '';
  let served = model;
  try {
    const j = (await res.json()) as { model?: string; choices?: { message?: { content?: string }; finish_reason?: string }[] };
    served = j.model ?? model;
    content = j.choices?.[0]?.message?.content ?? '';
  } catch {
    return { ok: false, reason: 'invalid_output', message: 'AI provider returned an unreadable response.' };
  }
  try {
    const parsed = opts.schema.safeParse(firstJsonObject(content));
    if (!parsed.success) return { ok: false, reason: 'invalid_output', message: 'The AI model returned JSON that did not match the required schema.' };
    return { ok: true, value: parsed.data as z.infer<S>, model: served };
  } catch {
    return { ok: false, reason: 'invalid_output', message: 'The AI model did not return a JSON object.' };
  }
}
