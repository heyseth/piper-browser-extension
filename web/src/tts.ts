import { getVoiceList, installVoice, getInstalledVoice } from "./services"
import { makeSynthesizer } from "./synthesizer"
import { makeSpeech } from "./speech"
import { playAudio } from "./audio"
import { MyVoice } from "./types"

const synthesizers = new Map<string, ReturnType<typeof makeSynthesizer>>()
let currentSpeech: ReturnType<typeof makeSpeech> | undefined
let voiceList: MyVoice[] = []

interface TTSCallbacks {
  onProgress?: (message: string) => void
  onReady?: () => void
  onError?: (error: Error) => void
}

/**
 * Initialize TTS with auto-download and load of alan[medium] voice
 */
export async function initTTS(callbacks: TTSCallbacks = {}) {
  const { onProgress, onReady, onError } = callbacks

  try {
    onProgress?.('Fetching voice list...')
    voiceList = await getVoiceList()

    const alanVoice = voiceList.find(v => v.key === 'en_GB-alan-medium')
    if (!alanVoice) {
      throw new Error('Alan voice not found in voice list')
    }

    // Auto-install if needed
    if (alanVoice.installState === 'not-installed') {
      onProgress?.('Auto-installing default voice: alan [medium]...')
      await installVoice(alanVoice, (percent) => {
        onProgress?.(`Downloading alan [medium]: ${Math.round(percent)}%`)
      })
    }

    // Load into memory
    onProgress?.('Loading alan [medium] into memory...')
    const synth = makeSynthesizer(alanVoice.key)
    synthesizers.set(alanVoice.key, synth)

    await synth.readyPromise
    onProgress?.('alan [medium] is ready to use')
    onReady?.()

    return {
      voiceList,
      synthesizer: synth
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    onError?.(error)
    throw error
  }
}

/**
 * Speak text using the loaded voice
 */
export async function speak(
  text: string,
  options: {
    voiceKey?: string
    speakerId?: number
    pitch?: number
    rate?: number
    volume?: number
    onSentence?: (startIndex: number, endIndex: number) => void
  } = {}
) {
  const {
    voiceKey = 'en_GB-alan-medium',
    speakerId,
    pitch,
    rate,
    volume,
    onSentence
  } = options

  const synth = synthesizers.get(voiceKey)
  if (!synth) {
    throw new Error(`Voice ${voiceKey} not loaded. Call initTTS() first.`)
  }

  // Cancel any current speech
  currentSpeech?.cancel()

  // Create new speech
  const speech = currentSpeech = makeSpeech(
    synth,
    {
      speakerId,
      text,
      playAudio: (pcmData, appendSilenceSeconds) =>
        playAudio(pcmData, appendSilenceSeconds, pitch, rate, volume)
    },
    {
      onSentence(startIndex, endIndex) {
        onSentence?.(startIndex, endIndex)
      }
    }
  )

  try {
    await speech.play()
  } catch (err: any) {
    if (err.name !== 'CancellationException') {
      throw err
    }
  } finally {
    if (currentSpeech === speech) {
      currentSpeech = undefined
    }
  }
}

/**
 * Pause current speech
 */
export function pause() {
  currentSpeech?.pause()
}

/**
 * Resume paused speech
 */
export function resume() {
  currentSpeech?.resume()
}

/**
 * Stop current speech
 */
export function stop() {
  currentSpeech?.cancel()
  currentSpeech = undefined
}

/**
 * Skip forward to next sentence
 */
export function forward() {
  currentSpeech?.forward()
}

/**
 * Skip back to previous sentence
 */
export function rewind() {
  currentSpeech?.rewind()
}

/**
 * Seek to specific sentence index
 */
export function seek(index: number) {
  currentSpeech?.seek(index)
}

/**
 * Get list of available voices
 */
export function getVoices() {
  return voiceList
}

/**
 * Load an additional voice into memory
 */
export async function loadVoice(
  voiceKey: string,
  onProgress?: (percent: number) => void
) {
  const voice = voiceList.find(v => v.key === voiceKey)
  if (!voice) {
    throw new Error(`Voice ${voiceKey} not found`)
  }

  // Install if needed
  if (voice.installState === 'not-installed') {
    await installVoice(voice, onProgress || (() => {}))
  }

  // Load into memory
  const synth = makeSynthesizer(voiceKey)
  synthesizers.set(voiceKey, synth)
  await synth.readyPromise

  return synth
}

/**
 * Unload voice from memory
 */
export function unloadVoice(voiceKey: string) {
  const synth = synthesizers.get(voiceKey)
  if (synth) {
    synth.dispose()
    synthesizers.delete(voiceKey)
  }
}
