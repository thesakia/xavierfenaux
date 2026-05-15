import OpenAI from "openai";
import { prisma } from "@/lib/db/prisma";

type JsonAgentArgs = {
  agent: string;
  model: string;
  system: string;
  user: string;
  relatedOpportunityId?: string;
};

const client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

export function getLightModel() {
  return process.env.OPENAI_MODEL_LIGHT || "gpt-5-mini";
}

export function getStrongModel() {
  return process.env.OPENAI_MODEL_STRONG || "gpt-5.5";
}

export function hasOpenAiKey() {
  return Boolean(process.env.OPENAI_API_KEY);
}

function estimateCost(inputTokens: number, outputTokens: number) {
  const inputPerMillion = Number(process.env.OPENAI_ESTIMATED_INPUT_PER_1M || 0);
  const outputPerMillion = Number(process.env.OPENAI_ESTIMATED_OUTPUT_PER_1M || 0);
  return (inputTokens / 1_000_000) * inputPerMillion + (outputTokens / 1_000_000) * outputPerMillion;
}

export async function runJsonAgent<T>(args: JsonAgentArgs): Promise<T | null> {
  if (!client) return null;

  let response;

  try {
    response = await client.chat.completions.create({
      model: args.model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: args.user },
      ],
    });
  } catch (error) {
    await prisma.auditLog.create({
      data: {
        action: "ai_error",
        message: `${args.agent} failed`,
        metadata: {
          model: args.model,
          error: error instanceof Error ? error.message : "Unknown OpenAI error",
        },
      },
    });
    return null;
  }

  const inputTokens = response.usage?.prompt_tokens ?? 0;
  const outputTokens = response.usage?.completion_tokens ?? 0;

  await prisma.costLog.create({
    data: {
      agent: args.agent,
      model: args.model,
      inputTokens,
      outputTokens,
      estimatedCost: estimateCost(inputTokens, outputTokens),
      relatedOpportunityId: args.relatedOpportunityId,
    },
  });

  const content = response.choices[0]?.message.content;
  if (!content) return null;
  return JSON.parse(content) as T;
}
