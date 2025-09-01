import { Ollama as OllamaClient } from "ollama";
import dotenv from "dotenv";
import type { ChatMessage, BaseGenerateArgs, GenerateResult, ThinkingModel, AgentTool } from "./types";

dotenv.config();

const LM_STUDIO_HOST = process.env.LM_STUDIO_PROXY_ADDRESS || process.env.LM_STUDIO_HOST; // e.g. http://localhost:1234
const OLLAMA_HOST = process.env.OLLAMA_HOST || process.env.OLLAMA_PROXY_ADDRESS; // e.g. http://localhost:11434

// Ollama native client
const ollama = new OllamaClient(OLLAMA_HOST ? { host: OLLAMA_HOST } : {});

export async function generateText(inputs: {
    provider: "lmstudio" | "ollama";
    model: string;
    promptOrMessages: string | ChatMessage[];
    thinking: ThinkingModel;
    tools: AgentTool[];
    stream?: boolean;
}) {
    if (inputs.provider === "lmstudio") {
        return parseLlmResponse(await lmStudioGenerate(inputs));
    } else {
        return parseLlmResponse(await ollamaGenerateText(inputs));
    }
};

function lmStudioGenerate(inputs: {
    model: string;
    promptOrMessages: string | ChatMessage[];
    thinking: ThinkingModel;
    stream?: boolean;
    tools?: AgentTool[];
}) {
    return typeof inputs.promptOrMessages === "string"
        ? generateLocalText({ ...inputs, prompt: inputs.promptOrMessages, provider: "lmstudio" })
        : generateLocalText({ ...inputs, messages: inputs.promptOrMessages, provider: "lmstudio" });
}

function ollamaGenerateText(inputs: {
    model: string;
    promptOrMessages: string | ChatMessage[];
    thinking: ThinkingModel;
    stream?: boolean;
    tools?: AgentTool[];
}) {
    return typeof inputs.promptOrMessages === "string"
        ? generateLocalText({ ...inputs, prompt: inputs.promptOrMessages, provider: "ollama" })
        : generateLocalText({ ...inputs, messages: inputs.promptOrMessages, provider: "ollama" });
}

function parseLlmResponse(response: GenerateResult<unknown>) {
    /**
     * <think>
     * ...
     * </think>
     */

    const thoughts = response.text.match(/<think>(.*?)<\/think>/s);
    const reply = response.text.replace(/<think>.*?<\/think>/s, "").trim();
    if (thoughts?.length && response.thinking?.isReasoningModel && response.thinking.logReasoning) {
        console.log("Reasoning process:", thoughts[1]);
    }

    return { thoughts, reply, toolCalls: response.message.tool_calls || [] };
}

// Direct LM Studio caller (no AI SDK wrappers) to avoid schema mismatches
async function lmStudioChatComplete(model: string, messages: ChatMessage[], tools: AgentTool[]): Promise<{ text: string; raw: any; toolCalls: any[] }> {
    if (!LM_STUDIO_HOST) throw new Error("LM Studio host not configured");
    const url = LM_STUDIO_HOST.replace(/\/$/, "") + "/v1/chat/completions";
    const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model, messages, tools }),
    });
    const json: any = await res.json();
    if (!res.ok) {
        throw new Error("LM Studio error: " + (json?.error || res.statusText));
    }
    const text = json?.choices?.[0]?.message?.content || "";
    return { text, raw: json, toolCalls: json?.choices?.[0]?.message?.tool_calls || [] };
}

async function generateLocalText(args: BaseGenerateArgs): Promise<GenerateResult> {
    const { provider, model, prompt, messages, tools = [], stream = false } = args;
    ensure(prompt, messages);

    try {
        if (provider === "lmstudio") {
            const msgArr: ChatMessage[] = messages ?? [{ role: "user", content: prompt! }];
            const { text, raw, toolCalls = [] } = await lmStudioChatComplete(model, msgArr, tools);
            return { provider: "lmstudio", model, text, raw, thinking: args.thinking, message: { role: "user", content: text, tool_calls: toolCalls } };
        }

        const chatMessages = messages ?? [{ role: "user", content: prompt! }];
        if (stream) {
            const iterator = await ollama.chat({ model, tools, messages: chatMessages, stream: true });
            let full = "";
            let toolCalls = [];
            for await (const part of iterator) {
                full += part.message?.content ?? "";
                toolCalls.push(...(part.message?.tool_calls || []));
            }
            return { provider: "ollama", model, text: full, thinking: args.thinking, message: { role: "user", content: full, tool_calls: toolCalls as any } };
        } else {
            const res = await ollama.chat({ model, tools, messages: chatMessages, stream: false });
            return { provider: "ollama", model, text: res?.message?.content ?? "", raw: res, thinking: args.thinking, message: { role: "user", content: res?.message?.content ?? "", tool_calls: res?.message?.tool_calls || [] as any } };
        }
    } catch (er) {
        console.log("ERROR IN generateLocalText:", er);
    }

    return { provider: "ollama", model, text: "failure", thinking: args.thinking, message: { role: "user", content: "failure", tool_calls: [] } };
}

function ensure(prompt: string | undefined, messages: ChatMessage[] | undefined) {
    if (!prompt && (!messages || messages.length === 0)) {
        throw new Error("Either prompt or messages must be provided");
    }
}