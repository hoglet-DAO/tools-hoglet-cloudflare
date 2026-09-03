import { NextResponse } from 'next/server';

const robotsText = `User-agent: *
Allow: /

# Explicitly allowed AI crawlers
User-agent: GPTBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Claude-Web
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: CCBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Applebot-Extended
Allow: /

User-agent: Bytespider
Allow: /

# Machine-readable guides for LLMs
# https://llmstxt.org/
# https://tools.hoglet.xyz/llms.txt
# https://tools.hoglet.xyz/llms-full.txt
`;

export async function GET() {
  return new NextResponse(robotsText, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
