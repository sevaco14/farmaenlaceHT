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

export const BEDROCK_TIMEOUT_MS = 25_000;

export class AgentValidationError extends Error {
  constructor() {
    super("El agente no devolvió un JSON válido con summary (1–300 caracteres), level (0–100) y rationale (1–1000 caracteres). Vuelve a analizar.");
    this.name = "AgentValidationError";
  }
}

export class AgentRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentRequestError";
  }
}

export function bedrockConfigured() {
  return process.env.BEDROCK_USE_INSTANCE_ROLE === "true" ||
    Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
}

function client() {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const hasExplicitCredentials = Boolean(accessKeyId && secretAccessKey);
  const useInstanceRole = process.env.BEDROCK_USE_INSTANCE_ROLE === "true";
  if (!hasExplicitCredentials && !useInstanceRole) {
    throw new AgentRequestError("Configura las credenciales completas del workshop en el backend Convex, o BEDROCK_USE_INSTANCE_ROLE=true para usar el rol IAM de la instancia AWS.");
  }
  return new BedrockRuntimeClient({
    region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1",
    // In AWS, omit credentials so the SDK can refresh the instance-profile
    // session through its default provider chain. No temporary keys are baked in.
    ...(hasExplicitCredentials ? {
      credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey!, sessionToken: process.env.AWS_SESSION_TOKEN },
    } : {}),
    // Every HTTP attempt must pass the shared Convex gate.
    maxAttempts: 1,
  });
}

export function safeBedrockError(error: unknown): string {
  if (error instanceof AgentValidationError || error instanceof AgentRequestError) return error.message;
  const name = error instanceof Error ? error.name : "";
  if (["ExpiredToken", "ExpiredTokenException", "UnrecognizedClientException", "InvalidClientTokenId", "CredentialsProviderError"].includes(name)) {
    return "La sesión temporal de AWS venció o no es válida. Renueva las credenciales completas del workshop o revisa el rol IAM de la instancia y vuelve a analizar.";
  }
  if (["AbortError", "TimeoutError", "RequestTimeout", "RequestTimeoutException"].includes(name)) {
    return "Bedrock excedió el tiempo de espera. No se guardó ninguna recomendación de este análisis. Vuelve a intentarlo explícitamente.";
  }
  if (name === "AccessDeniedException") return "AWS no permite invocar este modelo de Bedrock. Revisa los permisos y BEDROCK_MODEL_ID en us-east-1.";
  if (name === "ThrottlingException") return "AWS limitó la solicitud de Bedrock. Espera unos segundos y vuelve a analizar.";
  if (name === "ValidationException" || name === "ResourceNotFoundException") return "Bedrock rechazó la configuración del modelo. Verifica BEDROCK_MODEL_ID y la región habilitada para el workshop.";
  // AWS errors can contain request or credential details; never return raw text.
  return "No se pudo completar el análisis con Bedrock. No se guardó ninguna recomendación de este análisis; revisa la conexión AWS y vuelve a analizar.";
}

function extractText(blocks: ContentBlock[] | undefined): string {
  return (blocks ?? []).flatMap((block) => block.text ? [block.text] : []).join("\n");
}

export function parseAgentJson(text: string): AgentJson {
  let value: unknown;
  try { value = JSON.parse(text.trim()); } catch { throw new AgentValidationError(); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AgentValidationError();
  const parsed = value as Record<string, unknown>;
  if (
    Object.keys(parsed).length !== 3 ||
    typeof parsed.summary !== "string" || parsed.summary.trim().length === 0 || parsed.summary.length > 300 ||
    typeof parsed.rationale !== "string" || parsed.rationale.trim().length === 0 || parsed.rationale.length > 1000 ||
    typeof parsed.level !== "number" || !Number.isFinite(parsed.level) || parsed.level < 0 || parsed.level > 100
  ) throw new AgentValidationError();
  return { summary: parsed.summary.trim(), level: parsed.level, rationale: parsed.rationale.trim() };
}

export async function runAgentWithTools(args: {
  system: string;
  userTask: string;
  tools: ToolSpec[];
  executeTool: (name: string, input: Record<string, unknown>) => Promise<unknown>;
  withRequestPermit: <T>(request: () => Promise<T>) => Promise<T>;
  maxTurns?: number;
}): Promise<AgentJson> {
  const toolConfig: ToolConfiguration = {
    tools: args.tools.map((tool) => ({ toolSpec: {
      name: tool.name,
      description: tool.description,
      inputSchema: { json: tool.inputSchema as Record<string, unknown> },
    } })) as ToolConfiguration["tools"],
  };
  const allowedTools = new Set(args.tools.map((tool) => tool.name));
  const messages: Message[] = [{ role: "user", content: [{
    text: `${args.userTask}\nUsa las herramientas para verificar evidencia. Responde al final SOLO con JSON exacto: {"summary":"...","level":number,"rationale":"..."}. summary: 1–300 caracteres; rationale: 1–1000; level: número finito 0–100. No uses Markdown.`,
  }] }];
  const runtime = client();
  const maxTurns = args.maxTurns ?? 5;
  let validationRetried = false;
  let usedTool = false;
  let finalRetry = false;
  try {
    for (let turn = 0; turn < maxTurns + 1; turn++) {
      if (turn >= maxTurns && !finalRetry) break;
      const response = await args.withRequestPermit(() => runtime.send(
        new ConverseCommand({
          modelId: process.env.BEDROCK_MODEL_ID ?? "amazon.nova-lite-v1:0",
          system: [{ text: args.system }], messages, toolConfig,
          inferenceConfig: { maxTokens: 700, temperature: 0.1 },
        }),
        { abortSignal: AbortSignal.timeout(BEDROCK_TIMEOUT_MS) },
      ));
      const output = response.output?.message;
      const toolUses = (output?.content ?? []).filter((block) => block.toolUse);
      if (output) messages.push(output);
      if (toolUses.length > 0 && !finalRetry) {
        if (toolUses.length > 4) throw new AgentValidationError();
        const results: ContentBlock[] = [];
        for (const block of toolUses) {
          const use = block.toolUse!;
          if (!use.name || !use.toolUseId || !allowedTools.has(use.name)) throw new AgentValidationError();
          if (!use.input || typeof use.input !== "object" || Array.isArray(use.input)) throw new AgentValidationError();
          const payload = await args.executeTool(use.name, use.input as Record<string, unknown>);
          usedTool = true;
          results.push({ toolResult: { toolUseId: use.toolUseId, content: [{ text: JSON.stringify(payload) }] } });
        }
        messages.push({ role: "user", content: results });
        continue;
      }
      try {
        if (!usedTool || toolUses.length > 0) throw new AgentValidationError();
        return parseAgentJson(extractText(output?.content));
      } catch (error) {
        if (!(error instanceof AgentValidationError) || validationRetried) throw error;
        validationRetried = true;
        finalRetry = true;
        messages.push({ role: "user", content: [{ text: "La respuesta final fue inválida. Este es el único reintento: devuelve únicamente el objeto JSON con las tres claves summary, level y rationale, dentro de sus límites. No inventes datos ni autoridad. Conserva la evidencia ya consultada." }] });
      }
    }
    throw new AgentValidationError();
  } finally {
    runtime.destroy();
  }
}
