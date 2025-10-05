import React from 'react'
import { View, Text, Pressable, ActivityIndicator } from 'react-native'
import * as TTS from './tts'

/**
 * Example React Native component using Piper TTS
 */
export function TTSExample() {
  const [status, setStatus] = React.useState<string>('Not initialized')
  const [isReady, setIsReady] = React.useState(false)
  const [isSpeaking, setIsSpeaking] = React.useState(false)

  // Initialize TTS on mount
  React.useEffect(() => {
    TTS.initTTS({
      onProgress: (message) => {
        console.log(message)
        setStatus(message)
      },
      onReady: () => {
        setIsReady(true)
        setStatus('Ready')
      },
      onError: (error) => {
        console.error(error)
        setStatus(`Error: ${error.message}`)
      }
    })
  }, [])

  const handleSpeak = async () => {
    setIsSpeaking(true)
    try {
      await TTS.speak(
        "Hello! This is Piper text to speech. It works great in React Native web.",
        {
          onSentence: (start, end) => {
            console.log('Speaking sentence:', start, end)
          }
        }
      )
    } catch (err) {
      console.error('Speech error:', err)
    } finally {
      setIsSpeaking(false)
    }
  }

  const handleStop = () => {
    TTS.stop()
    setIsSpeaking(false)
  }

  return (
    <View style={{ padding: 20 }}>
      <Text style={{ fontSize: 18, marginBottom: 10 }}>
        Status: {status}
      </Text>

      {!isReady && <ActivityIndicator size="large" />}

      {isReady && (
        <View style={{ gap: 10 }}>
          <Pressable
            onPress={handleSpeak}
            disabled={isSpeaking}
            style={{
              backgroundColor: isSpeaking ? '#ccc' : '#007AFF',
              padding: 15,
              borderRadius: 8,
              alignItems: 'center'
            }}
          >
            <Text style={{ color: 'white', fontSize: 16 }}>
              {isSpeaking ? 'Speaking...' : 'Speak'}
            </Text>
          </Pressable>

          {isSpeaking && (
            <>
              <Pressable
                onPress={TTS.pause}
                style={{
                  backgroundColor: '#FFA500',
                  padding: 15,
                  borderRadius: 8,
                  alignItems: 'center'
                }}
              >
                <Text style={{ color: 'white', fontSize: 16 }}>Pause</Text>
              </Pressable>

              <Pressable
                onPress={TTS.resume}
                style={{
                  backgroundColor: '#28a745',
                  padding: 15,
                  borderRadius: 8,
                  alignItems: 'center'
                }}
              >
                <Text style={{ color: 'white', fontSize: 16 }}>Resume</Text>
              </Pressable>

              <Pressable
                onPress={handleStop}
                style={{
                  backgroundColor: '#dc3545',
                  padding: 15,
                  borderRadius: 8,
                  alignItems: 'center'
                }}
              >
                <Text style={{ color: 'white', fontSize: 16 }}>Stop</Text>
              </Pressable>
            </>
          )}
        </View>
      )}
    </View>
  )
}

/**
 * Simple imperative usage (no UI)
 */
export async function simpleTTSExample() {
  // Initialize
  await TTS.initTTS({
    onProgress: (msg) => console.log(msg),
    onReady: () => console.log('TTS Ready!')
  })

  // Speak
  await TTS.speak("Hello from Piper TTS!")

  // Speak with options
  await TTS.speak("This is slower and higher pitched", {
    rate: 0.8,
    pitch: 1.2,
    volume: 0.9
  })
}
