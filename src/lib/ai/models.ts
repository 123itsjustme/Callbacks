import "server-only";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import type { z } from "zod";

export function textModel() {
  return anthropic(process.env.AI_MODEL || "claude-sonnet-5-5");
}

/** Typed, Zod-validated structured generation (AI SDK v7: generateText + Output.object). */
export async function generateStructured<S extends z.ZodType>(opts: {
  schema: S;
  system: string;
  prompt: string;
  maxOutputTokens?: number;
}): Promise<z.infer<S>> {
  const { output } = await generateText({
    model: textModel(),
    system: opts.system,
    prompt: opts.prompt,
    maxOutputTokens: opts.maxOutputTokens ?? 8000,
    output: Output.object({ schema: opts.schema }),
  });
  return output as z.infer<S>;
}

/**
 * Live web research with Claude's web search tool. Returns the model's written research.
 * Kept separate from structured extraction, which is more reliable than combining both in one call.
 */
export async function webResearch(opts: { system: string; prompt: string; maxUses?: number; blockedDomains?: string[]; country?: string }) {
  const { isStepCount } = await import("ai");
  const res = await generateText({
    model: textModel(),
    system: opts.system,
    prompt: opts.prompt,
    maxOutputTokens: 8000,
    tools: {
      web_search: anthropic.tools.webSearch_20260318({
        maxUses: opts.maxUses ?? 15,
        blockedDomains: opts.blockedDomains,
        ...(opts.country ? { userLocation: { type: "approximate" as const, country: opts.country } } : {}),
      }),
    },
    stopWhen: isStepCount(4),
  });
  const urls = new Set<string>();
  for (const step of res.steps)
    for (const part of step.content)
      if (part.type === "tool-result" && Array.isArray(part.output))
        for (const r of part.output as { url?: string }[]) if (r?.url) urls.add(r.url);
  return { text: res.text, sourceUrls: [...urls] };
}
