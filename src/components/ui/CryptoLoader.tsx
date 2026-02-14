"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ThinkingStep, type ThinkingStepStatus } from "./ThinkingStep";

interface CryptoLoaderProps {
  size?: number;
  message?: string;
}

// Cryptographic-style characters for the animation
const CRYPTO_CHARS = "0123456789ABCDEF";

// Analysis steps with timing (in seconds) - Professional crypto security terminology
const ANALYSIS_STEPS = [
  { label: "Querying Blockchain State", triggerAt: 0 },
  { label: "Cross-Referencing Market Oracles", triggerAt: 2 },
  { label: "Capturing Visual Intelligence", triggerAt: 5 },
  { label: "Executing AI Forensic Analysis", triggerAt: 10 },
];

function RandomHexString({ delay = 0 }: { delay?: number }) {
  const [chars, setChars] = useState("f7b3c2e1a9d4");

  useEffect(() => {
    const interval = setInterval(() => {
      setChars(
        Array.from({ length: 12 }, () =>
          CRYPTO_CHARS[Math.floor(Math.random() * CRYPTO_CHARS.length)]
        ).join("")
      );
    }, 80);

    return () => clearInterval(interval);
  }, []);

  return (
    <motion.span
      initial={{ opacity: 0 }}
      animate={{ opacity: [0.3, 0.7, 0.3] }}
      transition={{ duration: 1.5, repeat: Infinity, delay }}
      className="font-mono text-xs text-zinc-500"
    >
      {chars}
    </motion.span>
  );
}

export function CryptoLoader({ size = 120, message = "Analyzing contract..." }: CryptoLoaderProps) {
  const [progress, setProgress] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);

  // Progress bar animation - slows down and caps at 95% (never loops)
  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 95) return 95; // Cap at 95%, never reset
        // Slow down as we approach 95%
        const remaining = 95 - prev;
        const increment = Math.max(0.5, remaining * 0.08);
        return Math.min(95, prev + increment);
      });
    }, 200);
    return () => clearInterval(interval);
  }, []);

  // Track elapsed time and update current step
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Update current step based on elapsed time
  useEffect(() => {
    for (let i = ANALYSIS_STEPS.length - 1; i >= 0; i--) {
      if (elapsedSeconds >= ANALYSIS_STEPS[i].triggerAt) {
        setCurrentStep(i);
        break;
      }
    }
  }, [elapsedSeconds]);

  // Get step status
  const getStepStatus = (index: number): ThinkingStepStatus => {
    if (index < currentStep) return "complete";
    if (index === currentStep) return "active";
    return "pending";
  };

  return (
    <div className="flex flex-col items-center justify-center gap-6 py-12">
      {/* Main loader container */}
      <div
        className="relative flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        {/* Outer rotating ring */}
        <motion.div
          className="absolute inset-0 rounded-full border border-zinc-800"
          animate={{ rotate: 360 }}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
        />

        {/* Middle pulsing ring */}
        <motion.div
          className="absolute rounded-full border border-primary/30"
          style={{ width: size * 0.75, height: size * 0.75 }}
          animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 2, repeat: Infinity }}
        />

        {/* Inner rotating ring with dashes */}
        <motion.svg
          className="absolute"
          width={size * 0.6}
          height={size * 0.6}
          viewBox="0 0 100 100"
          animate={{ rotate: -360 }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        >
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeDasharray="8 12"
            className="text-primary/50"
          />
        </motion.svg>

        {/* Center hex display */}
        <div className="absolute flex flex-col items-center gap-1">
          <motion.div
            className="w-2 h-2 rounded-full bg-primary"
            animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          />
          <span className="font-mono text-[10px] text-zinc-600 tracking-widest">
            {Math.floor(progress).toString(16).toUpperCase().padStart(2, "0")}
          </span>
        </div>

        {/* Corner hex values */}
        <div className="absolute -top-6 left-1/2 -translate-x-1/2">
          <RandomHexString delay={0} />
        </div>
        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2">
          <RandomHexString delay={0.3} />
        </div>
        <div className="absolute top-1/2 -left-16 -translate-y-1/2">
          <RandomHexString delay={0.6} />
        </div>
        <div className="absolute top-1/2 -right-16 -translate-y-1/2">
          <RandomHexString delay={0.9} />
        </div>
      </div>

      {/* Status text */}
      <div className="flex flex-col items-center gap-3">
        <motion.p
          className="text-sm text-zinc-400"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          {message}
        </motion.p>
        
        {/* Progress bar */}
        <div className="w-48 h-1 bg-zinc-800 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-primary/50 to-primary rounded-full"
            initial={{ width: "0%" }}
            animate={{ width: `${Math.min(progress, 100)}%` }}
            transition={{ duration: 0.1 }}
          />
        </div>
      </div>

      {/* Step-by-step progress tracker */}
      <div className="w-full max-w-sm bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 mt-2">
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-zinc-800">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-mono text-zinc-500 uppercase tracking-wider">
            Agent Activity
          </span>
          <span className="text-xs font-mono text-zinc-600 ml-auto">
            {elapsedSeconds}s
          </span>
        </div>
        
        <div className="space-y-2">
          {ANALYSIS_STEPS.map((step, index) => (
            <ThinkingStep
              key={step.label}
              label={step.label}
              status={getStepStatus(index)}
              delay={index * 0.1}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
