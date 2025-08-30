import { runWhisper } from "../ai/transcription";
import { cleanupTempFiles, validateAudioFile, withRetry } from "./utils";

export interface TranscriptionOptions {
  audioFilePath: string;
  model?: 'tiny' | 'base' | 'small' | 'medium' | 'large';
  language?: string;
  outputFormat?: 'json' | 'txt' | 'srt' | 'vtt' | 'tsv';
  cleanup?: boolean;
  temperature?: number;
  wordTimestamps?: boolean;
}

export interface TranscriptionResult {
  text: string;
  segments?: Array<{
    start: number;
    end: number;
    text: string;
  }>;
  metadata: {
    model: string;
    language: string;
    duration?: number;
    processingTime: number;
  };
}

export async function transcribeAudio(options: TranscriptionOptions): Promise<TranscriptionResult> {
    const {
        audioFilePath,
        model = options.model || 'small',
        language = options.language || 'en',
        outputFormat = options.outputFormat || 'json',
        cleanup = options.cleanup || false,
        temperature = options.temperature || 0.3,
        wordTimestamps = options.wordTimestamps || false
    } = options

    return withRetry(async () => {
        const startTime = Date.now();
        console.log(`Transcribing audio file: ${audioFilePath}`);

        validateAudioFile(audioFilePath);

        const { transcribedText, segments, duration } = await runWhisper({
            audioFilePath, model, language, outputFormat, temperature, wordTimestamps
        })

        if (cleanup) {
            await cleanupTempFiles(audioFilePath);
        }

        const processingTime = (Date.now() - startTime) / 1000;
        console.log(`Finished transcribing audio file: ${audioFilePath} in ${processingTime} seconds`);
        console.log(`Transcribed Text\n\n: ${transcribedText}`);

        return {
            text: transcribedText,
            segments: segments.map((seg: {start: number, end: number, text: string}) => ({
                start: seg.start || 0,
                end: seg.end || 0,
                text: seg.text || ""
            })),
            metadata: {
                model,
                language,
                duration: duration || 0,
                processingTime
            }
        };
    }, {
        maxAttempts: 3,
        baseDelay: 1000,
        context: "Transcription",
        exponentialBackoff: true
    })
}