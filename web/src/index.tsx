import * as React from "react"
import * as ReactDOM from "react-dom/client"
import { useImmer } from "use-immer"
import { playAudio } from "./audio"
import config from "./config"
import { advertiseVoices, deleteVoice, getPopularity, getVoiceList, installVoice, makeAdvertisedVoiceList, messageDispatcher, parseAdvertisedVoiceName, sampler, updateStats } from "./services"
import { makeSpeech } from "./speech"
import * as storage from "./storage"
import { makeSynthesizer } from "./synthesizer"
import { MyVoice, PcmData, PlayAudio } from "./types"
import { immediate, makeWav } from "./utils"

ReactDOM.createRoot(document.getElementById("app")!).render(<App />)

const query = new URLSearchParams(location.search)
const synthesizers = new Map<string, ReturnType<typeof makeSynthesizer>>()
let currentSpeech: ReturnType<typeof makeSpeech>|undefined


function App() {
  const [state, stateUpdater] = useImmer({
    voiceList: null as MyVoice[]|null,
    popularity: {} as {[voiceKey: string]: number},
    activityLog: "",
    isExpanded: {} as Record<string, boolean>,
    showInfoBox: false,
    test: {
      current: null as null|{type: "speaking"}|{type: "synthesizing", percent: number},
      downloadUrl: null as string|null
    }
  })
  const refs = {
    activityLog: React.useRef<HTMLTextAreaElement>(null!),
  }
  const installed = React.useMemo(() => state.voiceList?.filter(x => x.installState == "installed") ?? [], [state.voiceList])
  const notInstalled = React.useMemo(() => state.voiceList?.filter(x => x.installState != "installed") ?? [], [state.voiceList])
  const advertised = React.useMemo(() => makeAdvertisedVoiceList(state.voiceList), [state.voiceList])


  //startup
  React.useEffect(() => {
    getVoiceList()
      .then(voiceList => stateUpdater(draft => {
        draft.voiceList = voiceList
      }))
      .catch(reportError)
    getPopularity()
      .then(popularity => stateUpdater(draft => {
        draft.popularity = popularity
      }))
      .catch(console.error)
  }, [])

  //auto-install and load default voice
  React.useEffect(() => {
    if (!state.voiceList) return
    const alanVoice = state.voiceList.find(v => v.key === 'en_GB-alan-medium')
    if (!alanVoice) return

    const loadVoiceIntoMemory = () => {
      appendActivityLog('Loading alan [medium] into memory...')
      const synth = makeSynthesizer(alanVoice.key)
      synthesizers.set(alanVoice.key, synth)

      stateUpdater(draft => {
        draft.voiceList!.find(x => x.key === alanVoice.key)!.loadState = "loading"
      })

      synth.readyPromise
        .then(() => {
          stateUpdater(draft => {
            draft.voiceList!.find(x => x.key === alanVoice.key)!.loadState = "loaded"
          })
          appendActivityLog('alan [medium] is ready to use')
        })
        .catch(reportError)
    }

    if (alanVoice.installState === 'not-installed') {
      appendActivityLog('Auto-installing default voice: alan [medium]...')
      onInstall(alanVoice, () => {})
        .then(loadVoiceIntoMemory)
        .catch(() => {}) // Error already reported by onInstall
    } else if (alanVoice.installState === 'installed' && alanVoice.loadState === 'not-loaded') {
      loadVoiceIntoMemory()
    }
  }, [state.voiceList])

  //advertise voices
  React.useEffect(() => {
    if (advertised) advertiseVoices(advertised)
  }, [
    advertised
  ])

  //handle requests
  React.useEffect(() => {
    messageDispatcher.updateHandlers({
      speak: onSpeak,
      synthesize: onSynthesize,
      pause: onPause,
      resume: onResume,
      stop: onStop,
      forward: onForward,
      rewind: onRewind,
      seek: onSeek,
    })
  })

  //auto-scroll activity log
  React.useEffect(() => {
    refs.activityLog.current.scrollTop = refs.activityLog.current.scrollHeight
  }, [
    state.activityLog
  ])


  return (
    <div className="container">
      <div className="text-end text-muted small mt-1 mb-4">
        <span className="link"
          onClick={() => stateUpdater(draft => {draft.showInfoBox = true})}>What is Piper?</span>
      </div>

      {(query.has("showTest") ? query.get("showTest") != "0" : top == self) &&
        <div>
          <h2 className="text-muted">Test</h2>
          <form>
            <textarea className="form-control" rows={3} name="text" defaultValue={config.testSpeech} />
            <select className="form-control mt-3" name="voice">
              <option value="">Select a voice</option>
              {advertised?.map(voice => {
                const isAlan = voice.voiceName.includes('alan-medium')
                return <option key={voice.voiceName} value={voice.voiceName} selected={isAlan}>{voice.voiceName}</option>
              })}
            </select>
            <div className="d-flex align-items-center mt-3">
              {state.test.current == null &&
                <button type="button" className="btn btn-primary" onClick={onTestSpeak}>Speak</button>
              }
              {state.test.current?.type == "speaking" &&
                <button type="button" className="btn btn-primary" disabled>Speak</button>
              }
              {location.hostname == "localhost" && state.test.current?.type == "speaking" &&
                <>
                  <button type="button" className="btn btn-secondary ms-1" onClick={onPause}>Pause</button>
                  <button type="button" className="btn btn-secondary ms-1" onClick={onResume}>Resume</button>
                  <button type="button" className="btn btn-secondary ms-1" onClick={onForward}>Forward</button>
                  <button type="button" className="btn btn-secondary ms-1" onClick={onRewind}>Rewind</button>
                  <button type="button" className="btn btn-secondary ms-1"
                    onClick={() => onSeek({index: Number(prompt())})}>Seek</button>
                </>
              }
              {state.test.current == null &&
                <button type="button" className="btn btn-secondary ms-1" onClick={onTestSynthesize}>Download</button>
              }
              {state.test.current?.type == "synthesizing" &&
                <button type="button" className="btn btn-secondary ms-1" disabled>{state.test.current.percent}%</button>
              }
              {state.test.current &&
                <button type="button" className="btn btn-secondary ms-1" onClick={onStopTest}>Stop</button>
              }
              {state.test.downloadUrl &&
                <audio src={state.test.downloadUrl} controls className="ms-1" />
              }
            </div>
          </form>
        </div>
      }

      <div>
        <h2 className="text-muted">Activity Log</h2>
        <textarea className="form-control" disabled rows={4} ref={refs.activityLog} value={state.activityLog} />
      </div>

      <div>
        <h2 className="text-muted">Installed</h2>
        {installed.length == 0 &&
          <div className="text-muted">Installed voices will appear here</div>
        }
        {installed.length > 0 &&
          <table className="table table-borderless table-hover table-sm">
            <thead>
              <tr>
                <th>Voice Pack</th>
                <th>Language</th>
                <th>Status</th>
                <th></th>
                <th style={{width: "0%"}}></th>
              </tr>
            </thead>
            <tbody>
              {installed.map(voice =>
                <tr key={voice.key}>
                  <td>
                    <span className="me-1">{voice.name}</span>
                    <span className="me-1">[{voice.quality}]</span>
                    {voice.num_speakers <= 1 &&
                      <span className="link" onClick={() => sampler.play(voice)}>sample</span>
                    }
                    {voice.num_speakers > 1 &&
                      <span style={{cursor: "pointer"}}
                        onClick={() => toggleExpanded(voice.key)}>({voice.num_speakers} voices) {state.isExpanded[voice.key] ? '▲' : '▼'}</span>
                    }
                    {state.isExpanded[voice.key] &&
                      <ul>
                        {Object.entries(voice.speaker_id_map).map(([speakerName, speakerId]) =>
                          <li key={speakerId}>
                            <span className="me-1">{speakerName}</span>
                            <span className="link" onClick={() => sampler.play(voice, speakerId)}>sample</span>
                          </li>
                        )}
                      </ul>
                    }
                  </td>
                  <td className="align-top">{voice.language.name_native} ({voice.language.country_english})</td>
                  <td className="align-top">
                    {immediate(() => {
                      if (voice.numActiveUsers) return <span style={{fontWeight: "bold"}}>(in use)</span>
                      switch (voice.loadState) {
                        case "not-loaded": return "(on disk)"
                        case "loading": return <span style={{fontWeight: "bold", color: "red"}}>(loading)</span>
                        case "loaded": return "(in memory)"
                      }
                    })}
                  </td>
                  <td className="align-top text-end">{(voice.modelFileSize /1e6).toFixed(1)}MB</td>
                  <td className="align-top text-end ps-2">
                    <button type="button" className="btn btn-danger btn-sm"
                      onClick={() => onDelete(voice.key)}>Delete</button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        }
      </div>

      <div>
        <h2 className="text-muted">Available to Install</h2>
        {notInstalled.length > 0 &&
          <table className="table table-borderless table-hover table-sm">
            <thead>
              <tr>
                <th>Voice Pack</th>
                <th>Language</th>
                <th>Popularity</th>
                <th></th>
                <th style={{width: "0%"}}></th>
              </tr>
            </thead>
            <tbody>
              {notInstalled.map(voice =>
                <tr key={voice.key}>
                  <td>
                    <span className="me-1">{voice.name}</span>
                    <span className="me-1">[{voice.quality}]</span>
                    {voice.num_speakers <= 1 &&
                      <span className="link" onClick={() => sampler.play(voice)}>sample</span>
                    }
                    {voice.num_speakers > 1 &&
                      <span style={{cursor: "pointer"}}
                        onClick={() => toggleExpanded(voice.key)}>({voice.num_speakers} voices) {state.isExpanded[voice.key] ? '▲' : '▼'}</span>
                    }
                    {state.isExpanded[voice.key] &&
                      <ul>
                        {voice.speakerList.map(({speakerName, speakerId}) =>
                          <li key={speakerName}>
                            <span className="me-1">{speakerName}</span>
                            <span className="link" onClick={() => sampler.play(voice, speakerId)}>sample</span>
                          </li>
                        )}
                      </ul>
                    }
                  </td>
                  <td className="align-top">{voice.language.name_native} ({voice.language.country_english})</td>
                  <td className="align-top">
                    <div>{state.popularity[voice.key] ?? "\u00A0"}</div>
                    {state.isExpanded[voice.key] &&
                      voice.speakerList.map(({speakerName}) =>
                        <div key={speakerName}>{state.popularity[voice.key + speakerName] ?? "\u00A0"}</div>
                      )
                    }
                  </td>
                  <td className="align-top text-end">{(voice.modelFileSize /1e6).toFixed(1)}MB</td>
                  <td className="align-top text-end ps-2">
                    <InstallButton voice={voice} onInstall={onInstall} />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        }
      </div>

      <div className="text-center text-muted small mb-2">
        <span><a target="_blank" href="https://github.com/ken107/piper-browser-extension">
          <svg version="1.0" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 240 240" preserveAspectRatio="xMidYMid meet">
            <g transform="translate(0, 240) scale(0.1, -0.1)" fill="#666666" stroke="none">
              <path d="M970 2301 c-305 -68 -555 -237 -727 -493 -301 -451 -241 -1056 143 -1442 115 -116 290 -228 422 -271 49 -16 55 -16 77 -1 24 16 25 20 25 135 l0 118 -88 -5 c-103 -5 -183 13 -231 54 -17 14 -50 62 -73 106 -38 74 -66 108 -144 177 -26 23 -27 24 -9 37 43 32 130 1 185 -65 96 -117 133 -148 188 -160 49 -10 94 -6 162 14 9 3 21 24 27 48 6 23 22 58 35 77 l24 35 -81 16 c-170 35 -275 96 -344 200 -64 96 -85 179 -86 334 0 146 16 206 79 288 28 36 31 47 23 68 -15 36 -11 188 5 234 13 34 20 40 47 43 45 5 129 -24 214 -72 l73 -42 64 15 c91 21 364 20 446 0 l62 -16 58 35 c77 46 175 82 224 82 39 0 39 -1 55 -52 17 -59 20 -166 5 -217 -8 -30 -6 -39 16 -68 109 -144 121 -383 29 -579 -62 -129 -193 -219 -369 -252 l-84 -16 31 -55 32 -56 3 -223 4 -223 25 -16 c23 -15 28 -15 76 2 80 27 217 101 292 158 446 334 590 933 343 1431 -145 293 -419 518 -733 602 -137 36 -395 44 -525 15z" />
            </g>
          </svg>
        </a> &mdash; </span>
        <span><a target="_blank" href="https://readaloud.app/tos.html" className="muted-link">Terms of Service</a> &mdash; </span>
        <span><a target="_blank" href="https://readaloud.app/privacy.html" className="muted-link">Privacy Policy</a> &mdash; </span>
        <span>&copy; <a target="_blank" href="https://lsdsoftware.com" className="muted-link">LSD Software</a></span>
      </div>

      {state.showInfoBox &&
        <div className="modal d-block" style={{backgroundColor: "rgba(0,0,0,.5)"}} tabIndex={-1} aria-hidden="true"
          onClick={e => e.target == e.currentTarget && stateUpdater(draft => {draft.showInfoBox = false})}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">What is Piper?</h5>
                <button type="button" className="btn-close" aria-label="Close"
                  onClick={() => stateUpdater(draft => {draft.showInfoBox = false})}></button>
              </div>
              <div className="modal-body">
                <p>
                  Piper is a collection of high-quality, open-source text-to-speech voices developed by
                  the <a target="_blank" href="https://github.com/rhasspy/piper">Piper Project</a>,
                  powered by machine learning technology.
                  These voices are synthesized in-browser, requiring no cloud subscriptions, and are entirely
                  free to use.
                  You can use them to read aloud web pages and documents with
                  the <a target="_blank" href="https://readaloud.app">Read Aloud</a> extension,
                  or make them generally available to all browser apps through
                  the <a target="_blank" href="https://ttstool.com/redirect.html?target=piper-tts-extension">Piper TTS</a> extension.
                </p>
                <p>
                  Each of the voice packs is a machine learning model capable of synthesizing one or more
                  distinct voices.  Each pack must be separately installed.
                  Due to the substantial size of these voice packs, it is advisable to install only those
                  that you intend to use.
                  To assist in your selection, you can refer to the "Popularity" ranking, which indicates the
                  preferred choices among users.
                </p>
              </div>
            </div>
          </div>
        </div>
      }
    </div>
  )


  //controllers

  function reportError(err: unknown) {
    if (err instanceof Error) {
      console.error(err)
      appendActivityLog(String(err))
    }
    else {
      appendActivityLog(JSON.stringify(err))
    }
  }

  function appendActivityLog(text: string) {
    stateUpdater(draft => {
      draft.activityLog += text + '\n'
    })
  }

  function toggleExpanded(voiceKey: string) {
    stateUpdater(draft => {
      draft.isExpanded[voiceKey] = !draft.isExpanded[voiceKey]
    })
  }

  async function onInstall(voice: MyVoice, onProgress: (percent: number) => void) {
    storage.requestPersistence()
      .then(granted => console.info("Persistent storage:", granted))
      .catch(console.error)
    try {
      stateUpdater(draft => {
        draft.voiceList!.find(x => x.key == voice.key)!.installState = "installing"
      })
      const {model, modelConfig} = await installVoice(voice, onProgress)
      stateUpdater(draft => {
        draft.voiceList!.find(x => x.key == voice.key)!.installState = "installed"
      })
    }
    catch (err) {
      reportError(err)
    }
  }

  async function onDelete(voiceKey: string) {
    if (!confirm("Are you sure you want to uninstall this voice?")) return;
    try {
      synthesizers.get(voiceKey)?.dispose()
      synthesizers.delete(voiceKey)
      await deleteVoice(voiceKey)
      stateUpdater(draft => {
        const voiceDraft = draft.voiceList!.find(x => x.key == voiceKey)!
        voiceDraft.loadState = "not-loaded"
        voiceDraft.installState = "not-installed"
      })
    }
    catch (err) {
      reportError(err)
    }
  }

  function onSpeak(
    {utterance, voiceName, pitch, rate, volume, externalPlayback}: Record<string, unknown>,
    sender: {send(message: unknown): void}
  ) {
    if (!(
      typeof utterance == "string" &&
      typeof voiceName == "string" &&
      (typeof pitch == "number" || typeof pitch == "undefined") &&
      (typeof rate == "number" || typeof rate == "undefined") &&
      (typeof volume == "number" || typeof volume == "undefined") &&
      (typeof externalPlayback == "boolean" || typeof externalPlayback == "undefined")
    )) {
      throw new Error("Bad args")
    }
    speak({
      text: utterance,
      voiceName,
      playAudio(pcmData, appendSilenceSeconds) {
        if (externalPlayback) {
          const wav = makeWav([{pcmData, appendSilenceSeconds}])
          const id = String(Math.random())
          sender.send({to: "piper-host", type: "request", id, method: "audioPlay", args: {src: wav, rate, volume}})
          const playing = {
            completePromise: messageDispatcher.waitForResponse<void>(id),
            pause() {
              sender.send({to:"piper-host", type: "notification", method: "audioPause"})
              return {
                resume() {
                  sender.send({to: "piper-host", type: "notification", method: "audioResume"})
                  return playing
                }
              }
            }
          }
          return playing
        } else {
          return playAudio(pcmData, appendSilenceSeconds, pitch, rate, volume)
        }
      },
      callback(method, args) {
        sender.send({to: "piper-host", type: "notification", method, args})
      }
    })
  }

  function onSynthesize(
    {text, voiceName, pitch}: Record<string, unknown>,
    sender: {send(message: unknown): void}
  ) {
    if (!(
      typeof text == "string" &&
      typeof voiceName == "string" &&
      (typeof pitch == "number" || typeof pitch == "undefined")
    )) {
      throw new Error("Bad args")
    }
    const chunks = [] as Array<{pcmData: PcmData, appendSilenceSeconds: number}>
    speak({
      text,
      voiceName,
      playAudio(pcmData, appendSilenceSeconds) {
        chunks.push({pcmData, appendSilenceSeconds})
        const playing = {
          completePromise: Promise.resolve(),
          pause: () => ({resume: () => playing})
        }
        return playing
      },
      callback(method, args) {
        if (method == "onEnd") args = {...args, audioBlob: makeWav(chunks)}
        sender.send({to: "piper-host", type: "notification", method, args})
      }
    })
  }

  function speak({text, voiceName, playAudio, callback}: {
    text: string,
    voiceName: string,
    playAudio: PlayAudio,
    callback(method: string, args?: Record<string, unknown>): void
  }) {
    const {modelId, speakerName} = parseAdvertisedVoiceName(voiceName)
    const voice = state.voiceList!.find(({key}) => key.endsWith('-' + modelId))
    if (!voice) throw new Error("Voice not found")

    const speakerId = immediate(() => {
      if (speakerName) {
        if (!(speakerName in voice.speaker_id_map)) throw new Error("Speaker name not found")
        return voice.speaker_id_map[speakerName]
      }
    })

    appendActivityLog(`Synthesizing '${text.slice(0,50).replace(/\s+/g,' ')}...' using ${voice.name} [${voice.quality}] ${speakerName ?? ''}`)

    const synth = synthesizers.get(voice.key) ?? immediate(() => {
      appendActivityLog(`Initializing ${voice.name} [${voice.quality}], please wait...`)
      const tmp = makeSynthesizer(voice.key)
      synthesizers.set(voice.key, tmp)
      return tmp
    })

    currentSpeech?.cancel()
    const speech = currentSpeech = makeSpeech(synth, {speakerId, text, playAudio}, {
      onSentence(startIndex, endIndex) {
        notifyCaller("onSentence", {startIndex, endIndex})
      }
    })
    function notifyCaller(method: string, args?: Record<string, unknown>) {
      if (speech == currentSpeech)
        callback(method, args)
    }

    immediate(async () => {
      try {
        try {
          stateUpdater(draft => {
            draft.voiceList!.find(x => x.key == voice.key)!.loadState = "loading"
          })
          await synth.readyPromise
        }
        finally {
          stateUpdater(draft => {
            draft.voiceList!.find(x => x.key == voice.key)!.loadState = "loaded"
          })
        }

        const start = Date.now()
        try {
          stateUpdater(draft => {
            draft.voiceList!.find(x => x.key == voice.key)!.numActiveUsers++
          })
          notifyCaller("onStart", {sentenceStartIndicies: speech.sentenceStartIndicies})
          await speech.play()
          notifyCaller("onEnd")
        }
        finally {
          stateUpdater(draft => {
            draft.voiceList!.find(x => x.key == voice.key)!.numActiveUsers--
          })
          const duration = Date.now() - start
          updateStats(stats => {
            if (!stats.voiceUsage) stats.voiceUsage = {}
            const hashKey = voice.key + (speakerName ?? "")
            stats.voiceUsage[hashKey] = (stats.voiceUsage[hashKey] ?? 0) + duration
          })
        }
      }
      catch (err: any) {
        if (err.name != "CancellationException") {
          reportError(err)
          notifyCaller("onError", {error: err})
        }
      }
      finally {
        if (currentSpeech == speech) currentSpeech = undefined
      }
    })
  }

  function onPause() {
    currentSpeech?.pause()
  }

  function onResume() {
    currentSpeech?.resume()
  }

  function onStop() {
    currentSpeech?.cancel()
    currentSpeech = undefined
  }

  function onForward() {
    currentSpeech?.forward()
  }

  function onRewind() {
    currentSpeech?.rewind()
  }

  function onSeek({index}: Record<string, unknown>) {
    if (typeof index != "number") throw new Error("Bad args")
    currentSpeech?.seek(index)
  }

  function onTestSpeak(event: React.MouseEvent<HTMLButtonElement>) {
    const form = (event.target as HTMLButtonElement).form
    if (form?.text.value && form.voice.value) {
      if (state.test.downloadUrl) URL.revokeObjectURL(state.test.downloadUrl)
      stateUpdater(draft => {
        draft.test.downloadUrl = null
        draft.test.current = {type: "speaking"}
      })
      onSpeak({utterance: form.text.value, voiceName: form.voice.value}, {
        send({method, args}: {method: string, args?: Record<string, unknown>}) {
          console.log(method, args)
          if (method == "onEnd") {
            stateUpdater(draft => {
              draft.test.current = null
            })
          }
        }
      })
    }
  }

  function onTestSynthesize(event: React.MouseEvent<HTMLButtonElement>) {
    const form = (event.target as HTMLButtonElement).form!
    const text = form.text.value
    const voiceName = form.voice.value
    if (text && voiceName) {
      if (state.test.downloadUrl) URL.revokeObjectURL(state.test.downloadUrl)
      stateUpdater(draft => {
        draft.test.downloadUrl = null
        draft.test.current = {type: "synthesizing", percent: 0}
      })
      onSynthesize({text, voiceName}, {
        send({method, args}: {method: string, args?: Record<string, unknown>}) {
          console.log(method, args)
          if (method == "onEnd") {
            stateUpdater(draft => {
              draft.test.current = null
              if (args?.audioBlob instanceof Blob) draft.test.downloadUrl = URL.createObjectURL(args.audioBlob)
            })
          }
          else if (method == "onSentence") {
            stateUpdater(draft => {
              if (draft.test.current?.type == "synthesizing" && typeof args?.startIndex == "number")
                draft.test.current.percent = Math.round(100 * args.startIndex / text.length)
            })
          }
        }
      })
    }
  }

  function onStopTest() {
    onStop()
    stateUpdater(draft => {
      draft.test.current = null
    })
  }
}



function InstallButton({voice, onInstall}: {
  voice: MyVoice
  onInstall(voice: MyVoice, onProgress: (percent: number) => void): void
}) {
  const [percent, setPercent] = React.useState<number>(0)

  React.useEffect(() => {
    if (voice.installState == "not-installed") setPercent(0)
  }, [voice.installState])

  const text = immediate(() => {
    switch (voice.installState) {
      case "not-installed": return "Install"
      case "installing": return Math.round(percent) + "%"
      case "installed": return "100%"
    }
  })

  return (
    <button type="button" className="btn btn-success btn-sm"
      disabled={voice.installState != "not-installed"}
      onClick={() => onInstall(voice, setPercent)}>{text}</button>
  )
}
