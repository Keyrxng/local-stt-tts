/**
 * Find the first executable command from a list of commands
 */
function findExec(commands: string[]): string | null {
    if (!Array.isArray(commands) || commands.length === 0) {
        throw new Error("Commands must be a non-empty array.");
    }

    for (const command of commands) {
        if (isExecutable(findCommand(command))) {
            return command;
        }
    }

    return null;
}

/**
* Check if a command is executable
*/
function isExecutable(command: string): boolean {
    try {
        const { execSync } = require("child_process");

        // Special case for PowerShell in WSL
        if (command === 'powershell.exe') {
            try {
                execSync('powershell.exe -Command "echo test"', { stdio: "ignore", timeout: 3000 });
                return true;
            } catch {
                return false;
            }
        }

        // For other commands, check if they exist in PATH
        const checkCommand = findCommand(command);
        execSync(checkCommand, { stdio: "ignore", timeout: 2000 });
        return true;
    } catch {
        return false;
    }
}

/**
* Construct the platform-specific command to check for executability
*/
function findCommand(command: string): string {
    const { platform } = require("os");
    return /^win/.test(platform()) ? `where ${command}` : `command -v ${command}`;
}

/**
 * Get the list of audio players available on the current platform.
 */
function getPlatformAudioPlayers(): string[] {
    const { platform } = require("os");
    const fs = require("fs");
    const platformName = platform();

    // Check if we're in WSL
    const isWSL = process.env.WSL_DISTRO_NAME ||
        (fs.existsSync('/proc/version') &&
            fs.readFileSync('/proc/version', 'utf8').includes('Microsoft'));

    if (platformName === 'win32') {
        // Windows
        return ["powershell", "cmdmp3", "mplayer"];
    } else if (platformName === 'darwin') {
        // macOS
        return ["afplay", "mplayer", "mpg123", "play"];
    } else if (isWSL) {
        // WSL - try PowerShell first, then Linux audio players
        return [
            "powershell.exe",  // Windows PowerShell via WSL
            "aplay",           // ALSA player
            "paplay",          // PulseAudio player
            "sox",             // Swiss Army knife of audio
            "mpg123",          // MP3 player
            "cvlc",            // VLC command line
            "play"             // part of sox
        ];
    } else {
        // Linux and other Unix-like systems
        return [
            "aplay",           // ALSA player (most common on Linux)
            "paplay",          // PulseAudio player
            "mpg123",          // MP3 player
            "mpg321",          // Alternative MP3 player
            "mplayer",         // Media player
            "sox",             // Swiss Army knife of audio
            "play",            // part of sox
            "cvlc",            // VLC command line
            "omxplayer"        // Raspberry Pi
        ];
    }
}

/**
 * Get the first suitable audio player command for the current platform.
 */
export function getAudioPlayer(): string {
    const players = getPlatformAudioPlayers();
    if (!players?.length) throw new Error("No audio players found");
    const player = findExec(players) || players[0];

    const { platform } = require("os");
    const fs = require("fs");

    if (!player) {
        // If no audio player found, provide helpful error message
        const platformName = platform();
        const isWSL = process.env.WSL_DISTRO_NAME || fs.existsSync('/proc/version') &&
            fs.readFileSync('/proc/version', 'utf8').includes('Microsoft');

        let errorMsg = `No suitable audio player found on the system (${platformName}`;
        if (isWSL) {
            errorMsg += `, WSL detected`;
        }
        errorMsg += `). `;

        if (isWSL) {
            errorMsg += `Try installing: sudo apt install alsa-utils sox or enable Windows integration with PowerShell.`;
        } else if (platformName === 'linux') {
            errorMsg += `Try installing: sudo apt install alsa-utils sox mpg123 or sudo yum install alsa-utils sox mpg123`;
        } else if (platformName === 'darwin') {
            errorMsg += `Try installing: brew install sox mpg123`;
        }

        throw new Error(errorMsg);
    }
    return player;
}