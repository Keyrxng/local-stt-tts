import { playAudio } from "./src/audio/play-audio";
import { recordAudio } from "./src/audio/record-audio";
import { transcribeAudio } from "./src/audio/transcribe-audio";

async function main(){
    const path = await recordAudio({
        seconds: 5,
        outputPath: "./output.wav"
    });

    await playAudio(path);

    console.log("path:", path);

    const transcriptionResult = await transcribeAudio({
        audioFilePath: path,
    });

    console.log(transcriptionResult);
}

main().catch(console.error);