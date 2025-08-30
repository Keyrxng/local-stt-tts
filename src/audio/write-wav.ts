import type { PvRecorder } from "@picovoice/pvrecorder-node";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { WaveFile } from "wavefile";

export async function writeWavFile({
    frames,
    recorder,
    outputPath
}: {
    frames: Int16Array[];
    recorder: PvRecorder;
    outputPath?: string;
}) {
    try {
        const wav = new WaveFile();
        const audioData = new Int16Array(recorder.frameLength * frames.length);

        for (let i = 0; i < frames.length; i++) {
            if (frames[i] && frames[i]?.length) {
                audioData.set(frames[i] as ArrayLike<number>, i * recorder.frameLength);
            }
        }

        wav.fromScratch(1, recorder.sampleRate, "16", audioData);

        const wavBuffer = wav.toBuffer();

        const finalOutputPath = outputPath || path.join(tmpdir(), `recording_${Date.now()}.wav`);

        writeFileSync(finalOutputPath, wavBuffer);

        return finalOutputPath;
    } catch (error) {
        return Promise.reject(error);
    }
}