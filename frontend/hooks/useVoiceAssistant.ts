"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AssistantState = "idle" | "listening" | "thinking" | "speaking";

export interface NewsItemMeta {
    title: string;
    source?: string;
    url?: string;
}

export interface DisplayMessage {
    id: string;
    role: "user" | "assistant";
    text: string;
    meta?: {
        type: "news";
        items: NewsItemMeta[];
    };
}

interface UseVoiceAssistantOptions {
    initialLanguage?: "en" | "hi";
    enableSpeechRecognition?: boolean;
}

type WindowWithWebkitAudio = Window & typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
};

export function useVoiceAssistant(options?: UseVoiceAssistantOptions) {
    const POST_SPEECH_TIMEOUT_MS = 1800;
    const INITIAL_SILENCE_TIMEOUT_MS = 7000;

    const [messages, setMessages] = useState<DisplayMessage[]>([]);
    const [state, setState] = useState<AssistantState>("idle");
    const [language] = useState<"en" | "hi">(
        options?.initialLanguage || "en"
    );
    const [inputValue, setInputValue] = useState("");
    const [partialTranscript, setPartialTranscript] = useState("");

    const isSpeechAvailable =
        typeof navigator !== "undefined" &&
        !!navigator.mediaDevices &&
        typeof navigator.mediaDevices.getUserMedia === "function";

    // WebSocket and audio refs
    const wsRef = useRef<WebSocket | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
    const playbackAudioContextRef = useRef<AudioContext | null>(null);
    const nextStartTimeRef = useRef<number>(0);
    const [hasInteracted, setHasInteracted] = useState(false);
    const stopListeningRef = useRef<(() => void) | null>(null);
    const startListeningTriggerRef = useRef<((postSpeechTimeoutMs?: number, initialSilenceTimeoutMs?: number, force?: boolean) => void) | null>(null);
    const awaitingResponseRef = useRef(false);
    const responseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const recordingActiveRef = useRef(false);
    const autoListenTimerRef = useRef<NodeJS.Timeout | null>(null);
    const autoListenRetryTimerRef = useRef<NodeJS.Timeout | null>(null);
    const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
    const shouldResumeAfterCloseRef = useRef(false);

    const appendMessage = useCallback(
        (
            role: "user" | "assistant",
            text: string,
            meta?: DisplayMessage["meta"]
        ) => {
            setMessages((prev) => [
                ...prev,
                {
                    id: `${Date.now()}-${Math.random()}`,
                    role,
                    text,
                    meta,
                },
            ]);
        },
        []
    );

    const handleSend = useCallback(
        async (text?: string) => {
            const content = (text ?? inputValue).trim();
            if (!content || state === "thinking" || state === "speaking") return;

            if (!text) {
                setInputValue("");
            }

            appendMessage("user", content);
            appendMessage("assistant", "Text chat is currently disabled. Please use voice!");
        },
        [appendMessage, inputValue, state]
    );

    const clearResponseTimeout = useCallback(() => {
        if (responseTimeoutRef.current) {
            clearTimeout(responseTimeoutRef.current);
            responseTimeoutRef.current = null;
        }
    }, []);

    const clearAutoListenTimers = useCallback(() => {
        if (autoListenTimerRef.current) {
            clearTimeout(autoListenTimerRef.current);
            autoListenTimerRef.current = null;
        }
        if (autoListenRetryTimerRef.current) {
            clearTimeout(autoListenRetryTimerRef.current);
            autoListenRetryTimerRef.current = null;
        }
    }, []);

    const clearReconnectTimer = useCallback(() => {
        if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
        }
    }, []);

    // Initialize WebSocket connection
    const initWebSocket = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            return wsRef.current;
        }

        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const host = process.env.NEXT_PUBLIC_API_URL?.replace(/^https?:\/\//, "") || "localhost:8000";
        const ws = new WebSocket(`${protocol}//${host}/api/voice/ws/voice`);

        ws.onopen = () => {
            console.log("WebSocket connected to Sarvam streaming endpoint");
        };

        ws.onmessage = async (event) => {
            const message = JSON.parse(event.data);

            switch (message.type) {
                case "status":
                    console.log("Status:", message.message);
                    break;

                case "transcript_partial":
                    setPartialTranscript(message.text);
                    break;

                case "transcript_final":
                    setPartialTranscript("");
                    appendMessage("user", message.text);
                    break;

                case "thinking":
                    awaitingResponseRef.current = true;
                    setState("thinking");
                    break;

                case "audio_chunk":
                    // Decode and play audio chunk
                    clearResponseTimeout();
                    awaitingResponseRef.current = false;
                    setState("speaking");
                    await playAudioChunk(message.data);
                    break;

                case "audio_end":
                    // Audio playback complete
                    console.log("Audio playback complete:", message.message);

                    let delayMs = 500;
                    if (playbackAudioContextRef.current) {
                        const remaining = nextStartTimeRef.current - playbackAudioContextRef.current.currentTime;
                        if (remaining > 0) {
                            delayMs = (remaining * 1000) + 500;
                        }
                    }
                    console.log(`Waiting ${delayMs.toFixed(0)}ms for audio cleanup`);

                    clearResponseTimeout();
                    awaitingResponseRef.current = false;
                    clearAutoListenTimers();
                    shouldResumeAfterCloseRef.current = true;

                    autoListenTimerRef.current = setTimeout(() => {
                        setState("idle");
                        startListeningTriggerRef.current?.(POST_SPEECH_TIMEOUT_MS, INITIAL_SILENCE_TIMEOUT_MS, true);
                        autoListenRetryTimerRef.current = setTimeout(() => {
                            if (!recordingActiveRef.current && !awaitingResponseRef.current) {
                                console.warn("Auto-listen retry after audio_end");
                                startListeningTriggerRef.current?.(POST_SPEECH_TIMEOUT_MS, INITIAL_SILENCE_TIMEOUT_MS, true);
                            }
                        }, 1500);
                    }, delayMs);
                    break;

                case "error":
                    if (typeof message.message === "string" && message.message.toLowerCase().includes("no speech")) {
                        console.warn("No speech detected");
                        clearResponseTimeout();
                        awaitingResponseRef.current = false;
                        setState("idle");
                        startListeningTriggerRef.current?.(POST_SPEECH_TIMEOUT_MS, INITIAL_SILENCE_TIMEOUT_MS, true);
                        break;
                    }
                    console.error("WebSocket error:", message.message);
                    clearResponseTimeout();
                    awaitingResponseRef.current = false;
                    setState("idle");
                    break;

                case "no_speech":
                    console.warn("No speech detected");
                    clearResponseTimeout();
                    awaitingResponseRef.current = false;
                    setState("idle");
                    startListeningTriggerRef.current?.(POST_SPEECH_TIMEOUT_MS, INITIAL_SILENCE_TIMEOUT_MS, true);
                    break;
            }
        };

        ws.onerror = (error) => {
            console.error("WebSocket error:", error);
            clearResponseTimeout();
            clearAutoListenTimers();
            awaitingResponseRef.current = false;
            recordingActiveRef.current = false;
            setState("idle");
        };

        ws.onclose = () => {
            console.log("WebSocket disconnected");
            clearResponseTimeout();
            clearAutoListenTimers();
            awaitingResponseRef.current = false;
            recordingActiveRef.current = false;
            if (silenceTimerRef.current) {
                clearTimeout(silenceTimerRef.current);
                silenceTimerRef.current = null;
            }
            setState("idle");
            wsRef.current = null;

            if (
                hasInteracted &&
                shouldResumeAfterCloseRef.current &&
                !awaitingResponseRef.current &&
                !recordingActiveRef.current
            ) {
                clearReconnectTimer();
                reconnectTimerRef.current = setTimeout(() => {
                    console.log("WS closed after response; attempting auto-reconnect + listen");
                    startListeningTriggerRef.current?.(POST_SPEECH_TIMEOUT_MS, INITIAL_SILENCE_TIMEOUT_MS, true);
                }, 300);
            }
        };

        wsRef.current = ws;
        return ws;
    }, [appendMessage, clearResponseTimeout, clearAutoListenTimers, clearReconnectTimer, hasInteracted]);

    // Play audio chunk from base64
    const playAudioChunk = useCallback(async (audioB64: string) => {
        const AudioContextCtor =
            window.AudioContext || (window as WindowWithWebkitAudio).webkitAudioContext;
        if (!AudioContextCtor) return;

        if (!playbackAudioContextRef.current) {
            playbackAudioContextRef.current = new AudioContextCtor();
            nextStartTimeRef.current = playbackAudioContextRef.current.currentTime;
        }

        const audioContext = playbackAudioContextRef.current;
        const audioData = Uint8Array.from(atob(audioB64), c => c.charCodeAt(0));

        // Convert PCM Int16 to Float32
        const dataView = new DataView(audioData.buffer);
        const float32Data = new Float32Array(audioData.length / 2);
        for (let i = 0; i < float32Data.length; i++) {
            const int16 = dataView.getInt16(i * 2, true);
            float32Data[i] = int16 / 32768.0;
        }

        // Create and play buffer (24kHz for Sarvam TTS)
        const buffer = audioContext.createBuffer(1, float32Data.length, 24000);
        buffer.copyToChannel(float32Data, 0);

        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);

        if (nextStartTimeRef.current < audioContext.currentTime) {
            nextStartTimeRef.current = audioContext.currentTime;
        }
        source.start(nextStartTimeRef.current);
        nextStartTimeRef.current += buffer.duration;
    }, []);

    // Start listening with WebSocket streaming
    const startListening = useCallback(async (postSpeechTimeoutMs = POST_SPEECH_TIMEOUT_MS, initialSilenceTimeoutMs = INITIAL_SILENCE_TIMEOUT_MS, force = false) => {
        if (!navigator.mediaDevices || state === "listening") return;
        if (awaitingResponseRef.current && !force) return;

        try {
            if (force && awaitingResponseRef.current) {
                clearResponseTimeout();
                clearAutoListenTimers();
                awaitingResponseRef.current = false;
                recordingActiveRef.current = false;
                if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
                    wsRef.current.close();
                }
                wsRef.current = null;
            }

            const ws = initWebSocket();
            if (ws.readyState !== WebSocket.OPEN) {
                await Promise.race([
                    new Promise<void>((resolve, reject) => {
                        ws.addEventListener("open", () => resolve(), { once: true });
                        ws.addEventListener("error", () => reject(new Error("WebSocket open failed")), { once: true });
                    }),
                    new Promise<void>((_, reject) => {
                        setTimeout(() => reject(new Error("WebSocket open timeout")), 5000);
                    }),
                ]);
            }

            if (ws.readyState !== WebSocket.OPEN) {
                throw new Error("WebSocket is not open");
            }

            // Send start signal
            ws.send(JSON.stringify({ type: "audio_start" }));

            const postSpeechSilenceTimeoutMs = postSpeechTimeoutMs;
            let hasDetectedSpeech = false;
            let speechFrameCount = 0;
            const vadThreshold = 0.01;
            const minSpeechFrames = 2;

            const armStopTimer = (ms: number) => {
                if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
                silenceTimerRef.current = setTimeout(() => {
                    stopListeningRef.current?.();
                }, ms);
            };

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            armStopTimer(initialSilenceTimeoutMs);

            const AudioContextCtor =
                window.AudioContext || (window as WindowWithWebkitAudio).webkitAudioContext;
            if (!AudioContextCtor) {
                setState("idle");
                return;
            }
            const audioContext = new AudioContextCtor({ sampleRate: 16000 });
            audioContextRef.current = audioContext;

            const source = audioContext.createMediaStreamSource(stream);
            const processor = audioContext.createScriptProcessor(1024, 1, 1);
            processorRef.current = processor;

            source.connect(processor);
            processor.connect(audioContext.destination);

            processor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);

                // Voice Activity Detection
                let sum = 0;
                for (let i = 0; i < inputData.length; i++) {
                    sum += inputData[i] * inputData[i];
                }
                const rms = Math.sqrt(sum / inputData.length);

                if (rms > vadThreshold) {
                    speechFrameCount += 1;

                    if (!hasDetectedSpeech && speechFrameCount >= minSpeechFrames) {
                        hasDetectedSpeech = true;
                        console.log("Speech detected");
                        armStopTimer(postSpeechSilenceTimeoutMs);
                    } else if (hasDetectedSpeech) {
                        armStopTimer(postSpeechSilenceTimeoutMs);
                    }
                } else {
                    speechFrameCount = 0;
                }

                // Convert to Int16 PCM and send to WebSocket
                const pcmData = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                    pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
                }

                // Convert to base64 and send
                const buffer = new ArrayBuffer(pcmData.length * 2);
                const view = new DataView(buffer);
                for (let i = 0; i < pcmData.length; i++) {
                    view.setInt16(i * 2, pcmData[i], true);
                }
                const audioB64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));

                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: "audio_chunk",
                        data: audioB64
                    }));
                }
            };

            recordingActiveRef.current = true;
            shouldResumeAfterCloseRef.current = false;
            clearReconnectTimer();
            clearAutoListenTimers();
            setState("listening");

        } catch (err) {
            console.error("Failed to start listening:", err);
            recordingActiveRef.current = false;
            setState("idle");
        }
    }, [state, initWebSocket, clearAutoListenTimers, clearResponseTimeout, clearReconnectTimer]);

    // Stop listening
    const stopListening = useCallback(async () => {
        if (awaitingResponseRef.current || !recordingActiveRef.current) return;
        recordingActiveRef.current = false;
        clearReconnectTimer();
        clearAutoListenTimers();

        // Stop audio processing
        if (processorRef.current) {
            processorRef.current.disconnect();
            processorRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }

        // Clear timer
        if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
        }

        // Send end signal to WebSocket
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            awaitingResponseRef.current = true;
            wsRef.current.send(JSON.stringify({ type: "audio_end" }));
            clearResponseTimeout();
            responseTimeoutRef.current = setTimeout(() => {
                console.warn("Voice turn timed out waiting for backend response");
                awaitingResponseRef.current = false;
                if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
                    wsRef.current.close();
                }
                wsRef.current = null;
                setState("idle");
            }, 12000);
        }

        // Show neutral state; switch to "thinking" only when server sends it.
        setState("idle");
    }, [clearResponseTimeout, clearAutoListenTimers, clearReconnectTimer]);

    useEffect(() => {
        startListeningTriggerRef.current = (postSpeechTimeoutMs?: number, initialSilenceMs?: number, force?: boolean) => {
            void startListening(postSpeechTimeoutMs, initialSilenceMs, force);
        };
    }, [startListening]);

    useEffect(() => {
        stopListeningRef.current = stopListening;
    }, [stopListening]);

    const toggleListening = useCallback(async () => {
        if (!hasInteracted) {
            setHasInteracted(true);
            // Play intro
            try {
                awaitingResponseRef.current = false;
                clearResponseTimeout();
                setState("thinking");
                const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/voice/intro`);
                if (response.ok) {
                    const audioBlob = await response.blob();
                    const audioUrl = URL.createObjectURL(audioBlob);
                    const audio = new Audio(audioUrl);
                    let handled = false;
                    const startMicAfterIntro = () => {
                        if (handled) return;
                        handled = true;
                        URL.revokeObjectURL(audioUrl);
                        setState("idle");
                        setTimeout(() => {
                            void startListening(POST_SPEECH_TIMEOUT_MS, INITIAL_SILENCE_TIMEOUT_MS, true);
                        }, 250);
                    };

                    audio.onended = startMicAfterIntro;
                    audio.onerror = startMicAfterIntro;
                    setState("speaking");

                    try {
                        await audio.play();
                    } catch (playErr) {
                        console.warn("Intro playback blocked, starting mic directly:", playErr);
                        startMicAfterIntro();
                    }
                } else {
                    setState("idle");
                    void startListening(POST_SPEECH_TIMEOUT_MS, INITIAL_SILENCE_TIMEOUT_MS, true);
                }
            } catch (err) {
                console.error("Failed to play intro:", err);
                setState("idle");
                void startListening(POST_SPEECH_TIMEOUT_MS, INITIAL_SILENCE_TIMEOUT_MS, true);
            }
            return;
        }

        if (state === "listening") {
            stopListening();
        } else if (state === "idle" || state === "thinking") {
            shouldResumeAfterCloseRef.current = false;
            startListening(POST_SPEECH_TIMEOUT_MS, INITIAL_SILENCE_TIMEOUT_MS, true);
        }
    }, [startListening, stopListening, state, hasInteracted, clearResponseTimeout]);

    // Cleanup WebSocket on unmount
    useEffect(() => {
        return () => {
            clearResponseTimeout();
            clearAutoListenTimers();
            clearReconnectTimer();
            if (wsRef.current) {
                wsRef.current.close();
            }
            recordingActiveRef.current = false;
            shouldResumeAfterCloseRef.current = false;
            if (playbackAudioContextRef.current) {
                playbackAudioContextRef.current.close();
            }
        };
    }, [clearResponseTimeout, clearAutoListenTimers, clearReconnectTimer]);

    return {
        messages,
        state,
        language,
        inputValue,
        setInputValue,
        handleSend,
        isSpeechAvailable,
        startListening,
        stopListening,
        toggleListening,
        partialTranscript,
    };
}
