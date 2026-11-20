import "server-only";
import { openai } from "@ai-sdk/openai";
import { embed } from "ai";
import type { MasterData } from "./schemas";

// text-embedding-3-small returns 1536 dims, matching vector(1536) in the schema.
const embeddingModel = () => openai.embedding("text-embedding-3-small");

export async function embedText(text: string): Promise<number[]> {
  const { embedding } = await embed({ model: embeddingModel(), value: text.slice(0, 24000) });
  return embedding;
}

/** pgvector accepts the JSON-array text form via PostgREST. */
export const toPgVector = (v: number[]) => JSON.stringify(v);

export function profileEmbeddingText(p: {
  headline?: string | null;
  target_roles?: string[] | null;
  data: MasterData;
}) {
  const d = p.data;
  return [
    p.headline,
    p.target_roles?.length ? `Target roles: ${p.target_roles.join(", ")}` : "",
    d.summary,
    `Skills: ${d.skills.join(", ")}`,
    ...d.experience.map((e) => `${e.role} at ${e.company}. ${e.highlights.join(" ")}`),
    ...d.projects.map((pr) => `${pr.title} (${pr.client_or_org}): ${pr.description}`),
  ]
    .filter(Boolean)
    .join("\n");
}

export function jobEmbeddingText(j: { title: string; company_name: string; description_md: string }) {
  return `${j.title} at ${j.company_name}\n\n${j.description_md}`;
}
