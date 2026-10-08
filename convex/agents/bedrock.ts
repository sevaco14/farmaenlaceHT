"use node";

import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
  type Message,
  type ToolConfiguration,
} from "@aws-sdk/client-bedrock-runtime";

export type ToolSpec = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type AgentJson = {
  summary: string;
  level: number;
  rationale: string;
};

function client() {
  const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1";
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const sessionToken = process.env.AWS_SESSION_TOKEN;
  if (accessKeyId && secretAccessKey) {
    return new BedrockRuntimeClient({
      region,
      credentials: { accessKeyId, secretAccessKey, sessionToken },
    });
  }
  return new BedrockRuntimeClient({ region });
}

function modelId() {
  return process.env.BEDROCK_MODEL_ID ?? "amazon.nova-lite-v1:0";
}

export function bedrockConfigured() {
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY &&
      (process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION),
  );
}

function extractText(blocks: ContentBlock[] | undefined): string {
  if (!blocks) return "";
  return blocks
    .map((block) => (block.text ? block.text : ""))
    .filter(Boolean)
    .join("\n");
}

export function parseAgentJson(text: string): AgentJson {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return {
      summary: text.trim().slice(0, 240) || "Sin resumen del modelo.",
      level: 50,
      rationale: "Respuesta sin JSON estructurado.",
    };
  }
  try {
    const parsed = JSON.parse(match[0]) as Partial<AgentJson>;
    return {
      summary: String(parsed.summary ?? "Sin resumen."),
      level: Number(parsed.level ?? 50),
      rationale: String(parsed.rationale ?? ""),
    };
  } catch {
    return {
      summary: text.trim().slice(0, 240),
      level: 50,
      rationale: "JSON inválido del modelo.",
    };
  }
}

export async function runAgentWithTools(args: {
  system: string;
  userTask: string;
  tools: ToolSpec[];
  executeTool: (name: string, input: Record<string, unknown>) => Promise<unknown>;
  maxTurns?: number;
}): Promise<AgentJson> {
  const toolConfig: ToolConfiguration = {
    tools: args.tools.map((tool) => ({
      toolSpec: {
        name: tool.name,
        description: tool.description,
        inputSchema: { json: tool.inputSchema },
      },
    })),
  };

  const messages: Message[] = [
    {
      role: "user",
      content: [
        {
          text: `${args.userTask}\n\nCuando termines de usar herramientas, responde SOLO con JSON: {"summary":"...","level":number,"rationale":"..."}`,
        },
      ],
    },
  ];

  const maxTurns = args.maxTurns ?? 6;
  let lastText = "";

  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await client().send(
      new ConverseCommand({
        modelId: modelId(),
        system: [{ text: args.system }],
        messages,
        toolConfig,
        inferenceConfig: { maxTokens: 800, temperature: 0.2 },
      }),
    );

    const output = response.output?.message;
    if (!output) break;

    messages.push(output);
    lastText = extractText(output.content);

    const toolUses = (output.content ?? []).filter((block) => block.toolUse);
    if (toolUses.length === 0) break;

    const toolResults: ContentBlock[] = [];
    for (const block of toolUses) {
      const use = block.toolUse!;
      const input = (use.input ?? {}) as Record<string, unknown>;
      let payload: unknown;
      try {
        payload = await args.executeTool(use.name ?? "", input);
      } catch (error) {
        payload = {
          error: error instanceof Error ? error.message : "tool_failed",
        };
      }
      toolResults.push({
        toolResult: {
          toolUseId: use.toolUseId,
          content: [{ json: payload as Record<string, unknown> }],
        },
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  return parseAgentJson(lastText);
}
