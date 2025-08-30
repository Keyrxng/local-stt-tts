# local-stt-tts

Local, end‑to‑end speech ↔ text experimentation pipeline (record → transcribe → LLM → synthesize → play) using only locally hosted or self‑controlled services. It aims to stay small, readable, and easy to adapt – not to be a polished product. PRs / issues that improve clarity or reliability are welcome.

## Vision (longer‑term)

This stack is the foundation for a fully local personal assistant / coding & business partner: capture intent by voice, reason locally over context (projects, notes, tasks), respond conversationally, and optionally act (generate code, summarize, plan, execute). The current repository is just the speech <-> text loop; higher‑level memory, tooling, and automation layers will sit on top later.

## Why this exists

I wanted a single, minimal loop to:

1. Capture microphone audio (PvRecorder)
2. Run local Whisper for STT
3. Send the transcript to a local LLM (Ollama or LM Studio)
4. Turn the response into speech via a local / proxied TTS endpoint
5. Play it back with a best‑effort cross‑platform player


## High‑level flow

```
Mic → record-audio → WAV → whisper CLI → transcription → LLM (Ollama/LM Studio) → reply text → TTS (Orpheus) → WAV → local audio player
```

## Features (current)

- Microphone recording (fixed seconds or interactive) via `@picovoice/pvrecorder-node`
- WAV assembly using `wavefile`
- Whisper transcription (invokes the `whisper` CLI; supports multiple output formats, timestamps)
- Retry + basic error normalization (`withRetry`, `createServiceError`)
- Local LLM calls:
	- Ollama (chat or generate, optional streaming accumulation)
	- LM Studio (simple chat completions endpoint)
- Optional reasoning (<think>…</think>) tag extraction
- Text‑to‑speech via a simple POST to a configurable endpoint returning WAV
- Cross‑platform attempt at choosing an available audio player (Linux, macOS, Windows / WSL)

## Not (yet) included

- Real‑time / streaming partial transcription
- Automatic model downloads / management
- Robust CLI interface (only a demo script for now)
- Tests & benchmarks 
- Fine‑grained logging / telemetry

## Requirements / Prerequisites

| Component | Purpose | Install Hint |
|-----------|---------|--------------|
| Bun (≥1.0) | Runtime / build | https://bun.com |
| Node compatible environment | Runtime APIs | Already present with Bun |
| Whisper CLI | Speech‑to‑text | `pip install -U openai-whisper` (needs ffmpeg) |
| ffmpeg | Needed by Whisper | OS package manager (e.g. `sudo apt install ffmpeg`) |
| Ollama (optional) | Local LLMs | https://ollama.com |
| LM Studio (optional) | Alternative local LLM host | https://lmstudio.ai |
| TTS service (Pinokio + Orpheus) | Text→speech WAV endpoint (OpenAI‑style) | Provide at `TTS_PROXY_ADDRESS` (defaults to `http://localhost:5005/v1/audio/speech`) |

Only one of Ollama or LM Studio is needed unless you plan to switch dynamically.

## Environment variables

Set in a `.env` file or shell (dotenv is loaded):

```
# Ollama (either)
OLLAMA_HOST=http://localhost:11434
OLLAMA_PROXY_ADDRESS=http://localhost:11434

# LM Studio (either)
LM_STUDIO_HOST=http://localhost:1234
LM_STUDIO_PROXY_ADDRESS=http://localhost:1234

# TTS server endpoint (expected to accept OpenAI-compatible JSON body)
TTS_PROXY_ADDRESS=http://localhost:5005/v1/audio/speech
```

If both `*_HOST` and `*_PROXY_ADDRESS` exist, the code picks whichever is defined for that provider. For TTS the endpoint should return raw audio (WAV) data. At the moment this repo assumes a Pinokio‑launched FastAPI wrapper (lex-au Orpheus model) that exposes an OpenAI‑compatible `/v1/audio/speech` interface, internally leveraging LM Studio. In the future the middle layer may be removed and TTS invoked directly.

## Install

```bash
bun install
```

## Quick start (demo loop)

The repository includes `t.ts` which stitches everything together:

1. Records 5 seconds of audio to `output.wav`
2. Plays it back
3. Transcribes with Whisper (default model: `small` unless you override)
4. Sends transcript to a reasoning‑capable model (example: `deepseek-r1:1.5b` via Ollama)
5. Converts LLM reply to speech and plays it
6. Cleans up temp files

Build the demo bundle then run it:

```bash
# Build (produces bundle.js) via package script
bun run t

# Execute the bundled demo
node bundle.js
```

Or run directly (skipping bundling):

```bash
bun run ./t.ts
```

## Minimal usage examples

Record audio:
```ts
import { recordAudio } from "./src/audio/record-audio";
const wavPath = await recordAudio({ seconds: 3, outputPath: "./sample.wav" });
```

Transcribe:
```ts
import { transcribeAudio } from "./src/audio/transcribe-audio";
const result = await transcribeAudio({ audioFilePath: wavPath, model: "small" });
console.log(result.text);
```

Generate response:
```ts
import { generateText } from "./src/ai";
const llm = await generateText({
	provider: "ollama",
	model: "llama3.2:3b",
	promptOrMessages: "Summarize: " + result.text,
	thinking: { logReasoning: false, isReasoningModel: true },
	stream: false
});
```

Convert to speech:
```ts
import { textToSpeech } from "./src/audio/text-to-speech";
const speech = await textToSpeech({ text: llm.reply });
console.log("Saved WAV at", speech.filePath);
```

## Module outline

| Path | Purpose |
|------|---------|
| `src/audio/record-audio.ts` | Microphone capture via PvRecorder (interactive or timed) |
| `src/audio/save-audio.ts` | Assemble frames -> WAV buffer / file |
| `src/audio/transcribe-audio.ts` | High-level transcription w/ retry + cleanup |
| `src/ai/transcription.ts` | Direct Whisper CLI invocation |
| `src/ai/completions.ts` | LLM abstraction (Ollama & LM Studio) + reasoning extraction |
| `src/audio/text-to-speech.ts` | Generic TTS request + playback |
| `src/audio/play-audio.ts` | Cross-platform playback wrapper |
| `src/audio/audio-player-utils.ts` | Player discovery heuristics |
| `src/audio/utils.ts` | Retry, validation, temp cleanup |
| `src/errors.ts` | Standardized error creation |

## Configuration notes

- Whisper models: install them once (whisper will download on first run). Set `model` in `transcribeAudio` (e.g. `tiny`, `small`, `medium`, `large`).
- For longer recordings, interactive mode: pass `seconds: -1` when recording; press SPACE to start, SPACE to stop.
- Timestamps: set `wordTimestamps: true` in `transcribeAudio` options; segments returned include start/end.
- Reasoning models: if a model encloses internal thinking in `<think>` tags, those are stripped from the final reply but optionally logged.
- Current TTS path: Pinokio → Orpheus (FastAPI) → LM Studio backend. This indirection offers quick model swaps but adds overhead and may be replaced later.

### Performance (TTS)

Local TTS speed depends heavily on hardware (CPU/GPU availability, quantization, model size) and the extra Pinokio layer. If generation feels slow:
1. Confirm model quantization / size is ideal (use a smaller or quantized Orpheus variant if available).
2. Pre‑warm the model (send a short dummy request on startup).

## Error handling & resilience

`withRetry` implements exponential backoff (configurable attempts). Whisper + playback failures surface with contextual error messages (`AIServiceError`). This is intentionally lightweight; feel free to extend with structured logging.

## Roadmap / ideas

- Streaming microphone → incremental Whisper decoding
- Structured CLI (commands: record, transcribe, chat, tts)
- Unit tests (transcription parsing, segment mapping, player detection)
- Direct TTS integration (skip Pinokio middleman) & model selection abstraction
- Latency optimizations (async Whisper invocation, streaming partials)

## Limitations & disclaimers

- Not optimized for latency; each stage waits for completion.
- No security hardening (avoid exposing services publicly without protection).
- Whisper invocation is synchronous (`execSync`); large files may block the event loop.
- Playback detection is heuristic; may fail on minimal containers or unusual PATH setups.

## Acknowledgements

- [Whisper](https://github.com/openai/whisper)
- [Ollama](https://ollama.com)
- [LM Studio](https://lmstudio.ai)
- [PvRecorder](https://github.com/Picovoice/pvrecorder)
- Community TTS projects / endpoints

## License

MIT