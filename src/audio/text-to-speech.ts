import { buffer } from "node:stream/consumers";
import { writeWavBuffer } from "./save-audio";
import { withRetry } from "./utils";
import { playAudio } from "./play-audio";

export interface SpeechGenerationOptions {
    text: string;
    voice?: string;
    speed?: number;
    pitch?: number;
    volume?: number;
    model?: string;
    maxDuration?: number;
    outputPath?: string;
    autoPlay?: boolean;
}

export interface SpeechResult {
    filePath: string;
    audioBuffer: Buffer;
    metadata: {
        model: string;
        voice: string;
        duration?: number;
        fileSize: number;
    };
}

export async function textToSpeech(options: SpeechGenerationOptions) {
    const {
        text,
        voice = "default",
        speed = 1,
        model = "orpheus",
        autoPlay = true
    } = options;


    const audioBuffer = await generateTTS({ text, voice, speed, model });
    const filePath = await writeWavBuffer(audioBuffer);

    if (autoPlay) {
        await withRetry(async () => await playAudio(filePath), {
            baseDelay: 1000,
            exponentialBackoff: true,
            maxAttempts: 3,
            context: `Playing audio from ${filePath}`
        })
    }

    return {
        filePath,
        metadata: {
            model,
            voice,
            fileSize: audioBuffer.byteLength
        }
    } as SpeechResult;
}


async function generateTTS({
    text,
    voice,
    speed,
    model,
}: {
    text: string;
    voice: string;
    speed: number;
    model: string;
}) {
    const ttsEndpoint = process.env.TTS_PROXY_ADDRESS || "http://localhost:5005/v1/audio/speech";

    const response = await fetch(ttsEndpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model,
            input: text,
            voice: voice || "tara",
            speed: speed || 1.0,
            response_format: "wav"
        }),
        keepalive: true,
        signal: AbortSignal.timeout(300000) // 5 minutes
    });

    if (!response.ok) {
        throw new Error(`TTS request failed: ${response.statusText}`);
    }

    const audioData = await response.arrayBuffer();
    return Buffer.from(audioData);
}