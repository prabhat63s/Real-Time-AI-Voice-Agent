"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";

interface WaveAnimationProps {
    active: boolean;
}

export const WaveAnimation: React.FC<WaveAnimationProps> = ({ active }) => {
    const [bars, setBars] = useState<number[]>(new Array(64).fill(4));

    useEffect(() => {
        if (!active) return;

        const interval = setInterval(() => {
            setBars((prev) =>
                prev.map(() => Math.max(4, Math.floor(Math.random() * 45) + 4))
            );
        }, 80);

        return () => clearInterval(interval);
    }, [active]);

    return (
        <div className="flex h-24 w-full items-center justify-center gap-[3px] px-8">
            {bars.map((height, i) => (
                <motion.div
                    key={i}
                    initial={{ height: 4 }}
                    animate={{
                        height: active ? height : 4,
                        backgroundColor: active
                            ? (i % 2 === 0 ? "var(--accent-purple)" : "var(--accent-cyan)")
                            : "var(--glass-border)",
                    }}
                    transition={{
                        height: {
                            type: "spring",
                            stiffness: 400,
                            damping: 25
                        },
                        backgroundColor: {
                            duration: 0.5
                        }
                    }}
                    className="w-[3px] rounded-full"
                    style={{
                        boxShadow: active ? `0 0 15px ${i % 2 === 0 ? "rgba(139, 92, 246, 0.3)" : "rgba(6, 182, 212, 0.3)"}` : "none"
                    }}
                />
            ))}
        </div>
    );
};
