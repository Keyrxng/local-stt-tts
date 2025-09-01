import { Ollama as OllamaClient } from "ollama";
import dotenv from "dotenv";
import type { EmbeddingResult, BaseEmbeddingArgs } from "./types";

dotenv.config();

const LM_STUDIO_HOST = process.env.LM_STUDIO_PROXY_ADDRESS || process.env.LM_STUDIO_HOST; // e.g. http://localhost:1234
const OLLAMA_HOST = process.env.OLLAMA_HOST || process.env.OLLAMA_PROXY_ADDRESS; // e.g. http://localhost:11434

// Ollama native client
const ollama = new OllamaClient(OLLAMA_HOST ? { host: OLLAMA_HOST } : {});

export async function generateEmbeddings(inputs: BaseEmbeddingArgs): Promise<EmbeddingResult> {
    if (inputs.provider === "lmstudio") {
        return await lmStudioEmbeddings(inputs);
    } else {
        return await ollamaEmbeddings(inputs);
    }
}

async function lmStudioEmbeddings(inputs: BaseEmbeddingArgs): Promise<EmbeddingResult> {
    if (!LM_STUDIO_HOST) throw new Error("LM Studio host not configured");
    const url = LM_STUDIO_HOST.replace(/\/$/, "") + "/v1/embeddings";
    const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: inputs.model, input: inputs.input }),
    });
    const json: any = await res.json();
    if (!res.ok) {
        throw new Error("LM Studio error: " + (json?.error || res.statusText));
    }
    const embedding = json?.data?.[0]?.embedding || [];
    return { provider: "lmstudio", model: inputs.model, embedding, raw: json };
}

async function ollamaEmbeddings(inputs: BaseEmbeddingArgs): Promise<EmbeddingResult> {
    try {
        const res = await ollama.embeddings({ model: inputs.model, prompt: inputs.input });
        return { provider: "ollama", model: inputs.model, embedding: res.embedding, raw: res };
    } catch (er) {
        console.log("ERROR IN ollamaEmbeddings:", er);
        throw er;
    }
}
