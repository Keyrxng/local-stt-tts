import { PvRecorder } from "@picovoice/pvrecorder-node";
import { stdin } from "node:process";
import { writeWavFile } from "./save-audio";

type RecordAudioParams = {
    seconds: number;
    deviceIndex?: number;
    outputPath: string;
};

/**
 * Uses PicoVoice's PvRecorder to record audio from the microphone,
 * writes a wav file to a specified or temporary path and returns the path for playback.
 */
export async function recordAudio({
    seconds,
    deviceIndex = -1,
    outputPath
}: RecordAudioParams) {
    /**
     *  if true, record until user interrupts (Ctrl+C)
     *  binds space as the start button for interactive mode
     */
    const isInteractiveMode = await handleInteractiveMode(seconds);

    const { frames, recorder } = await _handleRecording({ isInteractiveMode, seconds, deviceIndex });

    await writeWavFile({ frames, recorder, outputPath });
    return outputPath;
}

/**
 * Either the user will specify a duration in seconds,
 * or the recording will continue until interrupted.
 */
async function handleInteractiveMode(seconds: number) {
    const isInteractiveMode = seconds === -1;

    try {
        const { stdin } = process;
        if (stdin.isTTY) {
            stdin.setRawMode(true);
        } else {
            stdin.resume();
        }

        stdin.setEncoding("utf-8")
        stdin.resume();

        if (isInteractiveMode) {
            console.log(
                "Interactive recording: press SPACE to start recording and SPACE again to stop."
            );
            await new Promise<void>((resolve) => {
                stdin.once("keypress", (_, key) => {
                    if (key && key.name === "space") resolve();
                    if (key && key.name === "c" && key.ctrl) {
                        process.exit(0);
                    }
                })
            })
        } else {
            console.log(`Recording for ${seconds} seconds...`);
        }
    } catch {
        // ignore
    }

    console.log("Speak now...");

    return isInteractiveMode;
}

async function _handleRecording({
    seconds,
    isInteractiveMode,
    deviceIndex
}: {
    seconds: number;
    isInteractiveMode: boolean;
    deviceIndex: number;
}) {
    const frames: Int16Array[] = [];
    const frameLen = 512;
    let isRecording = true;

    const recorder = new PvRecorder(frameLen, deviceIndex);
    console.log(`Using device: ${recorder.getSelectedDevice()}`);

    recorder.start();
    if (isInteractiveMode) {
        // allow a second press of space to stop the recording once started
        stdin.once("keypress", (key) => {
            if (key && key.name === "space") {
                isRecording = false;
            }
        });
    }

    // Grab a timeout if possible
    const recordingTimeout = !isInteractiveMode ? setTimeout(() => {
        isRecording = false;
    }, seconds * 1000) : null;


    while (isRecording) {
        const frame = await recorder.read();
        frames.push(frame);
    }

    console.log("Recording complete.");

    if (recordingTimeout) clearTimeout(recordingTimeout);

    stdin.setRawMode(false);
    stdin.pause();
    recorder.release();

    return { frames, recorder };
}