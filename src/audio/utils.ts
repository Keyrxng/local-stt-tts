import { existsSync, unlinkSync } from "node:fs"
import { createServiceError } from "../errors";
import { tmpdir } from "node:os";
import path from "node:path";

export async function withRetry<T>(
    operation: () => Promise<T>,
    config: {
        maxAttempts: number,
        baseDelay: number,
        exponentialBackoff: boolean
        context?: string
    }
) {

    const { maxAttempts, baseDelay, exponentialBackoff = true, context = "operation" } = config;

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error as Error;
            console.error(`Error occurred during ${context} (attempt ${attempt}):`, lastError);
        }

        if (exponentialBackoff && attempt < maxAttempts) {
            const delay = baseDelay * Math.pow(2, attempt - 1);
            await new Promise(resolve => setTimeout(resolve, delay));
        } else if (attempt < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, baseDelay));
        }
    }

    throw lastError;
}

export function validateAudioFile(audioFilePath: string): void {
    if (!existsSync(audioFilePath)) {
        throw createServiceError("Audio file does not exist", "Whisper STT");
    }
}

export async function cleanupTempFiles(audioFilePath: string): Promise<void> {
    const outputDir = tmpdir();
    const inputFileName = path.basename(audioFilePath, path.extname(audioFilePath));

    const cleanupFiles = [
        path.join(outputDir, `${inputFileName}.json`),
        path.join(outputDir, `${inputFileName}.srt`),
        path.join(outputDir, `${inputFileName}.txt`),
        path.join(outputDir, `${inputFileName}.vtt`),
        path.join(outputDir, `${inputFileName}.tsv`),
    ];

    for (const filePath of cleanupFiles) {
        try{
            if(existsSync(filePath)){
                unlinkSync(filePath);
            }
        }catch (error) {
            console.error(`Failed to delete temp file ${filePath}:`, error);
        }
    }
}