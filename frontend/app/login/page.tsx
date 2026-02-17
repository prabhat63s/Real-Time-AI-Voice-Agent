"use client";

import React, { useState } from "react";
import { login } from "@/lib/api";
import Cookies from "js-cookie";
import { MicIcon, ArrowRight } from "lucide-react";

export default function LoginPage() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setIsLoading(true);

        try {
            const success = await login(username, password);
            if (success) {
                Cookies.set("auth_token", "simple-auth-token", { expires: 1 });
                window.location.href = "/";
            } else {
                setError("Invalid username or password");
            }
        } catch (err) {
            setError("Something went wrong");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="relative min-h-screen w-full overflow-hidden bg-background text-foreground font-sans transition-colors duration-700 flex items-center justify-center">
            {/* Background Effects matching page.tsx */}
            <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-accent-purple/15 rounded-full mix-blend-screen filter blur-[120px] opacity-40 animate-blob" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-accent-cyan/15 rounded-full mix-blend-screen filter blur-[120px] opacity-40 animate-blob animation-delay-2000" />
            </div>

            <div className="relative z-10 w-full max-w-md p-8 md:p-10 mx-4">
                <div className="glass-morphism rounded-3xl p-8 shadow-2xl border border-white/10 backdrop-blur-xl">
                    <div className="flex flex-col items-center mb-8">
                        <div className="h-14 w-14 rounded-2xl bg-accent-purple/10 flex items-center justify-center text-accent-purple mb-4 shadow-inner ring-1 ring-accent-purple/20">
                            <MicIcon size={28} />
                        </div>
                        <h1 className="text-2xl font-bold tracking-tight text-center">
                            Welcome Back
                        </h1>
                        <p className="text-sm text-foreground/60 mt-2 text-center">
                            Sign in to continue to Echo Voice Assistant
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="space-y-1">
                            <label className="text-xs font-semibold uppercase tracking-wider text-foreground/70 ml-1">Username</label>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl bg-black/20 border border-white/10 text-foreground placeholder:text-foreground/30 focus:ring-2 focus:ring-accent-purple/50 focus:border-accent-purple/50 focus:outline-none transition-all"
                                placeholder="Enter username"
                                required
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-semibold uppercase tracking-wider text-foreground/70 ml-1">Password</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl bg-black/20 border border-white/10 text-foreground placeholder:text-foreground/30 focus:ring-2 focus:ring-accent-purple/50 focus:border-accent-purple/50 focus:outline-none transition-all"
                                placeholder="Enter password"
                                required
                            />
                        </div>

                        {error && (
                            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-200 text-sm text-center">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isLoading}
                            className={`w-full py-4 mt-2 rounded-xl bg-gradient-to-r from-accent-purple to-accent-secondary text-white font-bold tracking-wide shadow-lg shadow-accent-purple/20 hover:shadow-accent-purple/40 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
                        >
                            {isLoading ? 'Signing In...' : 'Sign In'}
                            {!isLoading && <ArrowRight size={18} />}
                        </button>
                    </form>
                </div>
                <div className="text-center mt-8">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-foreground/40 font-bold">
                        Powered by M37 Labs
                    </p>
                </div>
            </div>
        </div>
    );
}
