import Anthropic from '@anthropic-ai/sdk';

export type AnthropicMessage = { role: 'user' | 'assistant'; content: string };

export function createAnthropicClient() {
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'sk-ant-...') {
    return null;
  }
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

export function excerptAnthropicText(resp: Anthropic.Message): string {
  const block = resp.content?.[0] as { text?: string } | undefined;
  return block?.text ?? '';
}
