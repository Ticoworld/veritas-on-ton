"use client";

import { forwardRef, InputHTMLAttributes } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  variant?: "default" | "command";
  error?: boolean;
  showPrompt?: boolean;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, variant = "default", error, showPrompt = false, type = "text", ...props }, ref) => {
    const baseStyles = `
      w-full
      text-foreground placeholder:text-zinc-500
      transition-all duration-150
      disabled:opacity-50 disabled:cursor-not-allowed
      focus:outline-none
    `;

    const variants = {
      default: `
        h-10 px-4 text-sm
        bg-zinc-900 border border-zinc-800 rounded-lg
        hover:border-zinc-700
        focus:border-zinc-600 focus:ring-1 focus:ring-zinc-700
      `,
      command: `
        h-12 text-base font-mono
        bg-zinc-900 border border-zinc-800 rounded-lg
        hover:border-zinc-700
        focus:border-zinc-600 focus:ring-1 focus:ring-zinc-700
      `,
    };

    const errorStyles = error
      ? "border-danger/50 focus:border-danger focus:ring-danger/20"
      : "";

    if (variant === "command" || showPrompt) {
      return (
        <div className="relative flex items-center">
          <ChevronRight 
            className="absolute left-3 w-4 h-4 text-zinc-500" 
            strokeWidth={1.5} 
          />
          <input
            type={type}
            ref={ref}
            className={cn(baseStyles, variants[variant], errorStyles, "pl-9", className)}
            {...props}
          />
        </div>
      );
    }

    return (
      <input
        type={type}
        ref={ref}
        className={cn(baseStyles, variants[variant], errorStyles, className)}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";

export { Input };
