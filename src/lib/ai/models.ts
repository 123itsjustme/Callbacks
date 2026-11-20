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
