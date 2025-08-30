import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path";
import { createServiceError } from "../errors";

export async function runWhisper({
    audioFilePath,
    model,
    language,
    outputFormat,
    temperature,
    wordTimestamps
}:{
    audioFilePath: string,
    model: string,
    language: string,
    outputFormat: string,
    temperature: number,
    wordTimestamps: boolean
}) {
    const outputDir = tmpdir();
    const inputFileName = path.basename(audioFilePath, path.extname(audioFilePath));
    const outputJsonPath = path.join(outputDir, `${inputFileName}.json`);

    const whisperArgs = [
        `"${audioFilePath}"`,
        `--model "${model}"`,
        `--language "${language}"`,
        `--output_format "${outputFormat}"`,
        `--output_dir "${outputDir}"`,
        `--temperature ${temperature}`,
    ];

    if(wordTimestamps){
        whisperArgs.push(`--word_timestamps True`);
    }

    const command = `whisper ${whisperArgs.join(" ")}`;
    console.log("Starting STT via Whisper...");

    try {
        execSync(command, {
            stdio: ["pipe", "pipe", "pipe"],
            timeout: (30000) * 10
        })
    }catch (error) {
        throw createServiceError("Failed to run Whisper", "Whisper STT", error);
    }

    if(!existsSync(outputJsonPath)){
        throw createServiceError("Whisper did not produce output", "Whisper STT");
    }

    const output = JSON.parse(readFileSync(outputJsonPath, "utf8"));

    return {
        transcribedText: output.text,
        segments: output.segments,
        duration: output.duration || 0
    }
}