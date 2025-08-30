import { Ollama as OllamaClient } from "ollama";
import dotenv from "dotenv";
import type { ChatMessage, BaseGenerateArgs, GenerateResult, ThinkingModel } from "./types";

dotenv.config();

const LM_STUDIO_HOST = process.env.LM_STUDIO_PROXY_ADDRESS || process.env.LM_STUDIO_HOST; // e.g. http://localhost:1234
const OLLAMA_HOST = process.env.OLLAMA_HOST || process.env.OLLAMA_PROXY_ADDRESS; // e.g. http://localhost:11434

// Ollama native client
const ollama = new OllamaClient(OLLAMA_HOST ? { host: OLLAMA_HOST } : {});

export async function generateText(provider: "lmstudio" | "ollama", model: string, promptOrMessages: string | ChatMessage[], thinking: ThinkingModel, stream = false) {
    if (provider === "lmstudio") {
        return parseLlmResponse(await lmStudioGenerate(model, promptOrMessages, thinking, stream));
    } else {
        return parseLlmResponse(await ollamaGenerateText(model, promptOrMessages, thinking, stream));
    }
};

function lmStudioGenerate(model: string, promptOrMessages: string | ChatMessage[], thinking: ThinkingModel, stream = false) {
    return typeof promptOrMessages === "string"
        ? generateLocalText({ provider: "lmstudio", model, prompt: promptOrMessages, thinking, stream })
        : generateLocalText({ provider: "lmstudio", model, messages: promptOrMessages, thinking, stream });
}

function ollamaGenerateText(model: string, promptOrMessages: string | ChatMessage[], thinking: ThinkingModel, stream = false) {
    return typeof promptOrMessages === "string"
        ? generateLocalText({ provider: "ollama", model, prompt: promptOrMessages, thinking, stream })
        : generateLocalText({ provider: "ollama", model, messages: promptOrMessages, thinking, stream });
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
        // Log the reasoning process
        console.log("Reasoning process:", thoughts[1]);
    }

    return { thoughts, reply };
}

// Direct LM Studio caller (no AI SDK wrappers) to avoid schema mismatches
async function lmStudioChatComplete(model: string, messages: ChatMessage[]): Promise<{ text: string; raw: any }> {
    if (!LM_STUDIO_HOST) throw new Error("LM Studio host not configured");
    const url = LM_STUDIO_HOST.replace(/\/$/, "") + "/v1/chat/completions";
    const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model, messages }),
    });
    const json: any = await res.json();
    if (!res.ok) {
        throw new Error("LM Studio error: " + (json?.error || res.statusText));
    }
    const text = json?.choices?.[0]?.message?.content || "";
    return { text, raw: json };
}

export async function generateLocalText(args: BaseGenerateArgs): Promise<GenerateResult> {
    const { provider, model, prompt, messages, stream = false } = args;
    ensure(prompt, messages);

    if (provider === "lmstudio") {
        const msgArr: ChatMessage[] = messages ?? [{ role: "user", content: prompt! }];
        const { text, raw } = await lmStudioChatComplete(model, msgArr);
        return { provider: "lmstudio", model, text, raw, thinking: args.thinking };
    }

    if (prompt && !messages) {
        if (stream) {
            const iterator = await ollama.generate({ model, prompt, stream: true });
            let full = "";
            for await (const chunk of iterator) {
                // each chunk has .response
                const r = chunk;
                if (r?.response) full += r.response;
            }
            return { provider: "ollama", model, text: full, thinking: args.thinking };
        } else {
            const res = await ollama.generate({ model, prompt, stream: false });
            return { provider: "ollama", model, text: res?.response ?? "", raw: res, thinking: args.thinking };
        }
    }

    const chatMessages = messages ?? [{ role: "user", content: prompt! }];
    if (stream) {
        const iterator = await ollama.chat({ model, messages: chatMessages, stream: true });
        let full = "";
        for await (const part of iterator) {
            const c = part.message?.content;
            if (c) full += c;
        }
        return { provider: "ollama", model, text: full, thinking: args.thinking };
    } else {
        const res = await ollama.chat({ model, messages: chatMessages, stream: false });
        return { provider: "ollama", model, text: res?.message?.content ?? "", raw: res, thinking: args.thinking };
    }
}

function ensure(prompt: string | undefined, messages: ChatMessage[] | undefined) {
    if (!prompt && (!messages || messages.length === 0)) {
        throw new Error("Either prompt or messages must be provided");
    }
}