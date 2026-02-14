"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";

export type ThinkingStepStatus = "pending" | "active" | "complete";

interface ThinkingStepProps {
  label: string;
  status: ThinkingStepStatus;
  delay?: number;
}

export function ThinkingStep({ label, status, delay = 0 }: ThinkingStepProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay }}
      className="flex items-center gap-3"
    >
      {/* Status indicator */}
      <div className="relative flex items-center justify-center w-5 h-5">
        {status === "complete" && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center"
          >
            <Check className="w-3 h-3 text-emerald-400" strokeWidth={2} />
          </motion.div>
        )}
        
        {status === "active" && (
          <motion.div
            className="w-3 h-3 rounded-full bg-emerald-400"
            animate={{ 
              scale: [1, 1.3, 1],
              opacity: [1, 0.5, 1]
            }}
            transition={{ duration: 1, repeat: Infinity }}
          />
        )}
        
        {status === "pending" && (
          <div className="w-2 h-2 rounded-full bg-zinc-600" />
        )}
      </div>

      {/* Label */}
      <span
        className={`font-mono text-xs transition-colors ${
          status === "complete"
            ? "text-emerald-400"
            : status === "active"
            ? "text-zinc-200"
            : "text-zinc-600"
        }`}
      >
        {label}
        {status === "active" && (
          <motion.span
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            ...
          </motion.span>
        )}
      </span>
    </motion.div>
  );
}
