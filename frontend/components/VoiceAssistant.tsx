"use client";

import React from "react";
import { useVoiceAssistant } from "../hooks/useVoiceAssistant";
import { WaveAnimation } from "./WaveAnimation";
import { Mic, Square, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export const VoiceAssistant: React.FC = () => {
    const {
        state,
        isSpeechAvailable,
        toggleListening,
    } = useVoiceAssistant({ initialLanguage: "en" });

    const isListening = state === "listening";
    const isThinking = state === "thinking";
    const isSpeaking = state === "speaking";
    const isIdle = state === "idle";


    return (
        <div className="w-full flex flex-col items-center justify-center gap-16 relative">

            {/* Main Visualizer Stage */}
            <div className="relative flex flex-col items-center justify-center w-full max-w-2xl px-6 group/stage">

                {/* Ambient Environment Glow - Extremly Subtle */}
                <div className={`absolute inset-x-0 top-1/2 -translate-y-1/2 h-40 w-full opacity-[0.02] blur-[120px] rounded-full transition-colors duration-1000 ${isThinking || isSpeaking ? "bg-accent-cyan" : "bg-accent-purple"}`} />

                <div className="w-full z-10 mb-4 transform scale-105 transition-transform duration-700">
                    <WaveAnimation active={!isIdle} />
                </div>

                <div className="flex flex-col items-center gap-20 z-20 my-10">
                    {/* Mic Trigger - Premium Minimalist Button */}
                    <div className="relative group/btn">
                        <button
                            type="button"
                            disabled={!isSpeechAvailable}
                            onClick={toggleListening}
                            className={`relative flex h-30 w-30 items-center justify-center rounded-full transition-all duration-700 shadow-[0_30px_70px_-15px_rgba(0,0,0,0.6)] glass-morphism group active:scale-95 z-30 ${isListening
                                ? "bg-accent-purple border-accent-purple/40 scale-110 shadow-accent-purple/30"
                                : "hover:border-accent-purple/40 border-white/5 shadow-2xl"
                                } ${!isSpeechAvailable ? "opacity-20 cursor-not-allowed grayscale" : ""}`}
                        >
                            <div className="absolute inset-0 rounded-full bg-linear-to-br from-white/10 to-transparent opacity-0 group-hover/btn:opacity-100 transition-opacity duration-700" />

                            {isListening ? (
                                <Square className="text-white drop-shadow-lg z-10" size={34} fill="currentColor" />
                            ) : (
                                <Mic className={`transition-all duration-700 z-10 ${isThinking || isSpeaking ? "text-accent-cyan" : "text-foreground group-hover/btn:text-accent-purple group-hover/btn:scale-110"}`} size={42} />
                            )}
                        </button>

                        <div className="absolute -bottom-14 left-1/2 -translate-x-1/2 whitespace-nowrap overflow-hidden">
                            <motion.p
                                initial={{ opacity: 0, y: -10 }}
                                whileHover={{ opacity: 1, y: 0 }}
                                className="text-[9px] font-black tracking-[0.25em] text-slate-500 uppercase transition-all duration-500 group-hover/btn:translate-y-0 translate-y-2"
                            >
                                {isListening ? "Stop Interaction" : "Initialize Echo"}
                            </motion.p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Status / Hint Message */}
            <AnimatePresence mode="wait">
                {isIdle ? (
                    <motion.div
                        key="idle-hint"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="flex items-center gap-3 px-8 py-3 rounded-2xl glass-morphism border-white/5 shadow-2xl"
                    >
                        <Sparkles size={14} className="text-accent-purple animate-pulse" />
                        <span className="text-[11px] font-bold tracking-tight text-slate-400/80">Ask about weather, news, or just start a chat</span>
                    </motion.div>
                ) : (
                    <motion.div
                        key="active-status"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="flex items-center gap-3 px-6 py-2 rounded-full glass-morphism border-white/10 shadow-lg"
                    >
                        {isListening && <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse shadow-[0_0_10px_rgba(248,113,113,0.5)]" />}
                        {isThinking && <div className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce shadow-[0_0_10px_rgba(34,211,238,0.5)]" />}
                        {isSpeaking && <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_rgba(52,211,153,0.5)]" />}

                        <span className="text-xs font-bold text-slate-200 tracking-widest uppercase">
                            {isListening && "Listening"}
                            {isThinking && "Thinking"}
                            {isSpeaking && "Speaking"}
                        </span>
                    </motion.div>
                )}
            </AnimatePresence>

            {!isSpeechAvailable && (
                <div className="absolute bottom-[-100px] p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-300 text-[10px] font-bold tracking-widest uppercase animate-pulse">
                    Microphone access denied or unavailable.
                </div>
            )}
        </div>
    );
};
