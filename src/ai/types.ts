export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

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
}

export interface BaseGenerateArgs {
    provider: "lmstudio" | "ollama";
    thinking?: ThinkingModel;
    model: string; // model id or tag
    prompt?: string; // single-shot prompt (no chat history)
    messages?: ChatMessage[]; // chat style
    stream?: boolean; // streaming hint (currently only for Ollama implemented)
}