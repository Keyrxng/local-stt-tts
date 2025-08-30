import { generateText } from "./src/ai";
import { playAudio } from "./src/audio/play-audio";
import { recordAudio } from "./src/audio/record-audio";
import { textToSpeech } from "./src/audio/text-to-speech";
import { transcribeAudio } from "./src/audio/transcribe-audio";
import { cleanupTempFiles } from "./src/audio/utils";

async function main() {
    const path = await recordAudio({
        seconds: 5,
        outputPath: "./output.wav"
    });

    await playAudio(path);

    const transcriptionResult = await transcribeAudio({
        audioFilePath: path,
    });

    const llmResponse = await generateText({
        provider: "ollama",
        model: "deepseek-r1:1.5b",
        promptOrMessages: [
            {
                role: "system",
                content: `
The user content you will receive has been transcribed directly from their audio, as such, the accuracy of the transcription may not be 100%.

Your goal is to handle their input with common sense and nuance, be it responding to questions, engaging in conversation or performing actions on their behalf.

IMPORTANT:

- Your output is converted to audio for the user and so you should speak conversationally and succinctly.
- Your output needs to be free of special characters, formatting, markdown, and anything else that could interfere with the audio output.
`
            },
            {
                role: "user",
                content: transcriptionResult.text
            }
        ],
        thinking: { logReasoning: false, isReasoningModel: true },
        stream: true
    });

    console.log("LLM RESPONSE:: ", llmResponse);
    const { filePath } = await textToSpeech({
        text: llmResponse.reply,
    });


    await cleanupTempFiles(filePath);
}

main().catch(console.error);