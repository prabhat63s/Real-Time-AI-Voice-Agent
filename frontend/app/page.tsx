"use client";

import { VoiceAssistant } from "@/components/VoiceAssistant";
import { MicIcon, Palette, Check, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/components/AuthContext";

type Theme = "light" | "titanium" | "midnight" | "minimal";

const THEMES: { id: Theme; name: string; color: string }[] = [
  { id: "minimal", name: "Minimal", color: "bg-[#111111]" },
  { id: "light", name: "Snow", color: "bg-[#fcfcfd]" },
  { id: "midnight", name: "Midnight", color: "bg-[#0c0a21]" },
  { id: "titanium", name: "Titanium", color: "bg-[#262626]" },
];

export default function Home() {
  const { logout } = useAuth();
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== "undefined") {
      const savedTheme = localStorage.getItem("theme") as Theme;
      return (savedTheme && THEMES.find(t => t.id === savedTheme)) ? savedTheme : "titanium";
    }
    return "minimal";
  });
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      document.documentElement.setAttribute("data-theme", theme);
    }

    // Check Guide Status
    const hasSeenGuide = localStorage.getItem("has_seen_guide_v1");
    if (!hasSeenGuide) {
      setTimeout(() => setShowGuide(true), 1500);
    }
  }, [theme]);

  const closeGuide = () => {
    setShowGuide(false);
    localStorage.setItem("has_seen_guide_v1", "true");
  };

  const changeTheme = (newTheme: Theme) => {
    setTheme(newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("theme", newTheme);
    setIsPickerOpen(false);
  };

  return (
    <div className="relative h-screen w-full overflow-hidden bg-background text-foreground selection:bg-accent-purple/30 font-sans transition-colors duration-700">
      {/* Immersive Background Mesh */}
      <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-accent-purple/15 rounded-full mix-blend-screen filter blur-[120px] opacity-40 animate-blob" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-accent-cyan/15 rounded-full mix-blend-screen filter blur-[120px] opacity-40 animate-blob animation-delay-2000" />
      </div>

      <div className="relative z-10 flex flex-col h-full w-full">
        {/* Header */}
        <header className="absolute top-0 left-0 right-0 p-6 md:p-8 flex items-center justify-between z-30">
          <div className="flex items-center gap-2 group cursor-default">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl glass-morphism shadow-2xl group-hover:border-accent-purple/50 transition-all duration-500">
              <MicIcon className="text-accent-purple group-hover:text-accent-cyan transition-colors duration-500" size={20} />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-foreground leading-none">
              Echo
            </h1>
          </div>

          <div className="flex items-center gap-4">
            {/* Multi-Theme Selector */}
            <div className="relative">
              <button
                onClick={() => setIsPickerOpen(!isPickerOpen)}
                className={`flex h-10 px-4 items-center gap-2 rounded-2xl glass-morphism shadow-xl hover:border-accent-purple/50 transition-all duration-500 group ${isPickerOpen ? 'border-accent-purple/50 ring-1 ring-accent-purple/20' : ''}`}
                aria-label="Toggle Theme Picker"
              >
                <Palette className="text-accent-purple group-hover:text-accent-cyan transition-colors" size={18} />
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 hidden sm:block">Theme</span>
              </button>

              <AnimatePresence>
                {isPickerOpen && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    className="absolute right-0 mt-3 w-56 p-2 rounded-2xl glass-morphism shadow-2xl z-50 overflow-hidden"
                  >
                    <div className="grid grid-cols-1 gap-1">
                      {THEMES.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => changeTheme(t.id)}
                          className={`flex items-center justify-between px-3 py-2.5 rounded-xl transition-all duration-300 hover:bg-white/10 ${theme === t.id ? 'bg-white/10' : ''}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`h-4 w-4 rounded-full border border-white/20 shadow-sm ${t.color}`} />
                            <span className="text-xs font-semibold text-foreground/80">{t.name}</span>
                          </div>
                          {theme === t.id && <Check size={14} className="text-accent-purple" />}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Logout Button */}
            <button
              onClick={() => logout()}
              className="flex h-10 w-10 items-center justify-center rounded-2xl glass-morphism shadow-xl hover:border-red-500/50 hover:bg-red-500/5 transition-all duration-500 group"
              aria-label="Logout"
              title="Logout"
            >
              <LogOut className="text-slate-500 group-hover:text-red-500 transition-colors" size={18} />
            </button>
          </div>
        </header>

        {/* Main Interface - Centered focus */}
        <main className="flex-1 w-full flex flex-col items-center justify-center relative overflow-hidden px-4">
          <div className="w-full max-w-4xl h-full flex items-center justify-center">
            <VoiceAssistant />
          </div>
        </main>


        {/* Footer - Subtle floating branding */}
        <footer className="absolute bottom-0 left-0 right-0 p-8 flex items-center justify-center z-20">
          <p className="text-[10px] uppercase tracking-[0.3em] text-slate-600 font-bold hover:text-slate-400 transition-all cursor-default select-none">
            Powered by <a href="https://m37labs.com" target="_blank" rel="noopener noreferrer">M37 Labs</a>
          </p>
        </footer>
        {/* Onboarding Guide Overlay */}
        <AnimatePresence>
          {showGuide && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-100 flex items-center justify-center p-6 bg-black/60 backdrop-blur-md"
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="max-w-md w-full bg-background rounded-[32px] p-8 shadow-[0_40px_100px_rgba(0,0,0,0.5)] border border-foreground/5 relative overflow-hidden"
              >
                <div className="flex flex-col items-center text-center gap-6">
                  <div className="h-16 w-16 rounded-[24px] bg-accent-purple/20 flex items-center justify-center text-accent-purple shadow-inner">
                    <MicIcon size={32} />
                  </div>

                  <div className="space-y-2">
                    <h2 className="text-2xl font-black tracking-tight text-foreground">Welcome to Echo</h2>
                    <p className="text-foreground/60 text-sm leading-relaxed px-4">
                      Your premium minimalist voice assistant. Here is a quick guide to get started:
                    </p>
                  </div>

                  <div className="w-full space-y-3 py-2">
                    <div className="flex items-center gap-4 text-left p-4 rounded-2xl bg-foreground/3 border border-foreground/5 hover:bg-foreground/5 transition-colors">
                      <div className="h-8 w-8 rounded-full bg-accent-purple/10 flex items-center justify-center text-[10px] font-black text-accent-purple">1</div>
                      <p className="text-xs font-bold text-foreground/80 leading-snug">Tap the Mic to start a natural conversation.</p>
                    </div>
                    <div className="flex items-center gap-4 text-left p-4 rounded-2xl bg-foreground/3 border border-foreground/5 hover:bg-foreground/5 transition-colors">
                      <div className="h-8 w-8 rounded-full bg-accent-cyan/10 flex items-center justify-center text-[10px] font-black text-accent-cyan">2</div>
                      <p className="text-xs font-bold text-foreground/80 leading-snug">Switch between 4 premium themes in the header.</p>
                    </div>
                  </div>

                  <div className="flex gap-3 w-full pt-4">
                    <button
                      onClick={closeGuide}
                      className="flex-1 py-4 rounded-2xl bg-foreground text-background font-black text-[10px] tracking-[0.2em] uppercase hover:opacity-90 transition-all hover:scale-[1.02] active:scale-[0.98]"
                    >
                      Got it
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
