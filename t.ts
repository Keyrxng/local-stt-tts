import { recordAudio } from "./src/audio/record-audio";
import { PvRecorder } from "@picovoice/pvrecorder-node";

async function main(){
    const devices = PvRecorder.getAvailableDevices();
    console.log("Devices:", devices);

    recordAudio({
        seconds: 5,
        outputPath: "./output.wav"
    });
}

main().catch(console.error);