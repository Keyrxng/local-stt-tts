export type ChatMessage = { role: "system" | "user" | "assistant" | "tool"; content: string; tool_call_id?: string };

export type ThinkingModel = {
    isReasoningModel?: boolean;
    logReasoning: boolean;
};

export interface GenerateResult<T = unknown> {
    thinking?: ThinkingModel;
    provider: "lmstudio" | "ollama";
    model: string;
    text: string;
    raw?: T; // provider-specific raw response
    message: {
      role: "user" | "assistant";
      content: string;
      tool_calls?: Array<{ tool: string; args: Record<string, any> }>;
    }
}

export interface BaseGenerateArgs {
    provider: "lmstudio" | "ollama";
    thinking?: ThinkingModel;
    model: string; // model id or tag
    prompt?: string; // single-shot prompt (no chat history)
    messages?: ChatMessage[]; // chat style
    stream?: boolean; // streaming hint (currently only for Ollama implemented)
    tools?: AgentTool[];
}

export interface AgentTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, ParameterDefinition>;
      required: string[];
    };
  };
}

export interface ParameterDefinition {
  type: "string" | "number" | "boolean" | "array" | "object";
  description: string;
  enum?: string[];
  items?: ParameterDefinition;
  properties?: Record<string, ParameterDefinition>;
}

export interface EmbeddingResult {
  provider: "lmstudio" | "ollama";
  model: string;
  embedding: number[];
  raw?: any;
}

export interface BaseEmbeddingArgs {
  provider: "lmstudio" | "ollama";
  model: string;
  input: string;
}