import { Ollama as OllamaClient } from "ollama";
import dotenv from "dotenv";
import type { EmbeddingResult, BaseEmbeddingArgs, VisionEmbeddingArgs, VisionEmbeddingResult } from "./types";

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

export async function generateVisionEmbeddings(inputs: VisionEmbeddingArgs): Promise<VisionEmbeddingResult> {
    if (inputs.provider === "lmstudio") {
        return await lmStudioVisionEmbeddings(inputs);
    } else {
        return await ollamaVisionEmbeddings(inputs);
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

async function lmStudioVisionEmbeddings(inputs: VisionEmbeddingArgs): Promise<VisionEmbeddingResult> {
    if (!LM_STUDIO_HOST) throw new Error("LM Studio host not configured");
    const url = LM_STUDIO_HOST.replace(/\/$/, "") + "/v1/embeddings";

    // Prepare messages for vision model
    const messages = [];
    if (inputs.prompt) {
        messages.push({ role: "user", content: inputs.prompt });
    }

    // Add images to the message
    if (inputs.images && inputs.images.length > 0) {
        const content = [];
        if (inputs.prompt) {
            content.push({ type: "text", text: inputs.prompt });
        }
        for (const image of inputs.images) {
            content.push({
                type: "image_url",
                image_url: { url: image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}` }
            });
        }
        messages.push({ role: "user", content });
    }

    const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            model: inputs.model,
            input: inputs.input,
            messages: messages.length > 0 ? messages : undefined
        }),
    });
    const json: any = await res.json();
    if (!res.ok) {
        throw new Error("LM Studio vision error: " + (json?.error || res.statusText));
    }
    const embedding = json?.data?.[0]?.embedding || [];
    return {
        provider: "lmstudio",
        model: inputs.model,
        embedding,
        raw: json,
        imageCount: inputs.images?.length || 0,
        processedImages: inputs.images
    };
}

async function ollamaVisionEmbeddings(inputs: VisionEmbeddingArgs): Promise<VisionEmbeddingResult> {
    try {
        // Build a deterministic system + user prompt that asks LLaVA 1.6 to return
        // a JSON object we can parse safely. This prompt asks for a canonical_text
        // suitable for embedding plus optional tags and caption.
        const systemPrompt = `You are an image understanding assistant. Return ONLY valid JSON with these keys: \n` +
            `- caption: a one-line human-readable caption\n` +
            `- canonical_text: a short (1-2 sentences) canonical text suitable for embedding\n` +
            `- tags: an array of short tags\n` +
            `- objects: an array of detected objects (optional)\n` +
            `If you cannot analyze the image, return empty fields. Do NOT include extra commentary.`;

            // Build a single-string prompt: system + optional user prompt + instruction
            const userPrompt = inputs.prompt ? String(inputs.prompt) : '';
            const combinedPrompt = `${systemPrompt}\n\n${userPrompt}\n\nPlease analyze the provided image(s) and respond with the JSON described in the system message.`;

            // Ollama's generate endpoint expects images as raw base64 strings (no `data:` prefix)
            const imagesForOllama = (inputs.images || []).map(img => {
                if (!img) return undefined;
                if (typeof img !== 'string') return undefined;
                if (img.startsWith('data:')) {
                    const parts = img.split(',');
                    return parts.length > 1 ? parts[1] : parts[0];
                }
                return img;
            }).filter(Boolean) as string[];

            // Call generate with prompt + images. Use any-safe extraction of response text.
            const genRes: any = await ollama.generate({
                model: inputs.model,
                prompt: combinedPrompt,
                images: imagesForOllama.length > 0 ? imagesForOllama : undefined,
                stream: false,
                options: { temperature: 0 }
            });

            // genRes shape may vary across client versions; try common accessors
            let responseText = '';
            if (!genRes) responseText = '';
            else if (typeof genRes === 'string') responseText = genRes;
            else if (genRes.message?.content) responseText = genRes.message.content;
            else if (genRes.output?.text) responseText = genRes.output.text;
            else if (Array.isArray(genRes.output)) responseText = genRes.output.map((o: any) => o?.text || o?.content || '').join('');
            else responseText = String(genRes?.output || genRes?.text || JSON.stringify(genRes));

        // Try to parse JSON from the model response
        let parsed: any = null;
        try {
            parsed = JSON.parse(responseText);
        } catch (parseErr) {
            // Attempt to extract JSON substring if the model added backticks or commentary
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try { parsed = JSON.parse(jsonMatch[0]); } catch (e) { parsed = null; }
            }
        }

        // Use canonical_text from parsed output, or fallback to caption or a minimal prompt
        const canonical = parsed?.canonical_text || parsed?.caption || inputs.prompt || 'an image';

        console.log("OUTPUTS:::\n", {
            genRes,
            canonical,
            responseText,
            parsed
        })

        // Generate the text embedding for the canonical text using the text embedding model
        const textEmbeddingResult = await ollama.embeddings({ model: 'mxbai-embed-large:latest', prompt: canonical });
        const embedding = textEmbeddingResult.embedding;

        return {
            provider: 'ollama',
            model: inputs.model,
            embedding,
            raw: genRes,
            imageCount: inputs.images?.length || 0,
            processedImages: inputs.images,
            llmOutput: parsed || responseText,
            textToEmbed: canonical
        };
    } catch (er) {
        console.log('ERROR IN ollamaVisionEmbeddings:', er);
        throw er;
    }
}
