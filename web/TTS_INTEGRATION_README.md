# Piper TTS Integration for React Native Web

This guide explains how to use the Piper TTS functionality in a React Native web deployment.

## What Was Changed

Created **`tts.ts`** - a simplified API module that:
- Auto-downloads and loads the alan[medium] voice on initialization
- Provides simple functions for speech control
- No React UI dependencies (works with any React Native app)

## Files Needed

Copy these files to your React Native project:

### Core TTS Files (no changes needed)
- `audio.ts` - Audio playback using Web Audio API
- `speech.ts` - Speech synthesis logic and playback control
- `synthesizer.ts` - ONNX model interface
- `phonemizer.ts` - Text-to-phoneme conversion
- `inference-worker.ts` - Web Worker for TTS inference
- `config.ts` - Configuration constants
- `types.ts` - TypeScript type definitions
- `utils.ts` - Utility functions
- `services.ts` - Voice management and downloading
- `storage.ts` - File storage using Origin Private File System

### New Files (created for you)
- **`tts.ts`** - Main TTS API (USE THIS)
- `example-usage.tsx` - Example React Native component

### Worker Build Artifact
You'll need the compiled worker file. Build it with:
```bash
cd web
npm install
npm run build-debug
```
Then copy `web/dist/inference-worker.js` to your project's public folder.

## Installation

### 1. Install Dependencies

```bash
npm install @lsdsoftware/message-dispatcher onnxruntime-web rxjs
```

### 2. Copy Files

Copy all the files listed above to your React Native project (e.g., `src/tts/`)

### 3. Configure Worker Path

Edit `synthesizer.ts` line 9 to point to your worker file location:
```typescript
const worker = new Worker("/inference-worker.js") // Update this path
```

Also edit `inference-worker.ts` line 7 if needed:
```typescript
ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.3/dist/"
```

## Usage

### Simple Example

```typescript
import * as TTS from './tts'

// Initialize (auto-downloads and loads alan[medium] voice)
await TTS.initTTS({
  onProgress: (msg) => console.log(msg),
  onReady: () => console.log('Ready!'),
  onError: (err) => console.error(err)
})

// Speak
await TTS.speak("Hello from Piper TTS!")

// Speak with options
await TTS.speak("This is customized speech", {
  rate: 1.2,      // Speed (0.5 to 2.0)
  pitch: 1.1,     // Pitch (0.5 to 2.0)
  volume: 0.8,    // Volume (0.0 to 1.0)
  onSentence: (start, end) => {
    console.log('Speaking:', text.slice(start, end))
  }
})

// Control playback
TTS.pause()
TTS.resume()
TTS.stop()
TTS.forward()   // Next sentence
TTS.rewind()    // Previous sentence
TTS.seek(3)     // Jump to sentence index 3
```

### React Native Component

See `example-usage.tsx` for a complete React Native component example with UI controls.

```typescript
import { TTSExample } from './tts/example-usage'

function App() {
  return <TTSExample />
}
```

## API Reference

### `initTTS(callbacks?)`
Initializes TTS and auto-downloads/loads the alan[medium] voice.

**Parameters:**
- `callbacks.onProgress?: (message: string) => void` - Progress updates
- `callbacks.onReady?: () => void` - Called when ready
- `callbacks.onError?: (error: Error) => void` - Error handler

**Returns:** `Promise<{voiceList, synthesizer}>`

### `speak(text, options?)`
Speaks the given text.

**Parameters:**
- `text: string` - Text to speak
- `options.voiceKey?: string` - Voice to use (default: 'en_GB-alan-medium')
- `options.speakerId?: number` - Speaker ID for multi-speaker voices
- `options.pitch?: number` - Pitch adjustment (0.5-2.0)
- `options.rate?: number` - Speed adjustment (0.5-2.0)
- `options.volume?: number` - Volume (0.0-1.0)
- `options.onSentence?: (start, end) => void` - Sentence callback

**Returns:** `Promise<void>`

### Control Functions
- `pause()` - Pause current speech
- `resume()` - Resume paused speech
- `stop()` - Stop and cancel current speech
- `forward()` - Skip to next sentence
- `rewind()` - Skip to previous sentence
- `seek(index)` - Jump to sentence at index

### Voice Management
- `getVoices()` - Get list of available voices
- `loadVoice(voiceKey, onProgress?)` - Load additional voice
- `unloadVoice(voiceKey)` - Unload voice from memory

## How It Works

1. **Initialization**: `initTTS()` downloads the voice list, auto-installs alan[medium] if needed, and loads it into memory
2. **Voice Storage**: Voices are stored in Origin Private File System (browser persistent storage)
3. **Synthesis**: Text → phonemes → ONNX inference → PCM audio → Web Audio API playback
4. **Web Worker**: Heavy inference runs in a separate thread to avoid blocking UI

## Browser Requirements

- Modern browser with:
  - Web Audio API
  - Web Workers
  - Origin Private File System (OPFS)
  - WebAssembly
  - SharedArrayBuffer (for multi-threading)

Works on:
- Chrome/Edge 108+
- Safari 16.4+
- Firefox 111+

## Notes

- First run downloads ~63MB (alan[medium] voice model)
- Subsequent runs load from cache (fast)
- All processing happens in-browser (no cloud API needed)
- Works offline after initial download
- React Native Web provides all necessary Web APIs
