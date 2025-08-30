import { getAudioPlayer } from "./audio-player-utils";

export async function playAudio(filePath: string): Promise<void> {
    if (!filePath) throw new Error("Audio filepath is required for playback")

    const { spawn } = await import("node:child_process")
    const audioPlayer = getAudioPlayer();

    return new Promise((resolve, reject) => {
        console.log(`Playing audio using ${audioPlayer}: ${filePath}`);

        let args = [filePath];
        let command = audioPlayer;

        if (audioPlayer === "powershell.exe") {
            // Convert the file path to Windows format by replacing WSL paths
            const windowsPath = filePath.replace(/^\/mnt\/([a-z])/, '$1:').replace(/\//g, '\\');
            args = ['-Command', `(New-Object System.Media.SoundPlayer('${windowsPath}')).PlaySync()`];
        }

        const process = spawn(command, args, { stdio: "ignore" });

        if (!process) {
            return reject(
                new Error(`Unable to spawn process with player: ${audioPlayer}`)
            )
        }

        process.on("close", (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Audio playback failed with code: ${code}`));
            }
        });

        process.on("error", (err) => {
            reject(new Error(`Audio playback error: ${err.message}`));
        });
    });
}