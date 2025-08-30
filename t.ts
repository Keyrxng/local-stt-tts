import { playAudio } from "./src/audio/play-audio";
import { recordAudio } from "./src/audio/record-audio";

async function main(){
    const path = await recordAudio({
        seconds: 5,
        outputPath: "./output.wav"
    });

    await playAudio(path);
}

main().catch(console.error);