import { forwardRef, HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "safe" | "danger" | "warning" | "neutral";
  size?: "sm" | "md";
}

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "neutral", size = "md", children, ...props }, ref) => {
    const baseStyles = `
      inline-flex items-center justify-center
      font-medium tracking-tight
      rounded-full
      border
      transition-colors duration-200
    `;

    const variants = {
      safe: `
        bg-primary/5 text-primary-light border-primary/20
      `,
      danger: `
        bg-danger/5 text-danger-light border-danger/20
      `,
      warning: `
        bg-warning/5 text-warning-light border-warning/20
      `,
      neutral: `
        bg-white/5 text-muted border-white/10
      `,
    };

    const sizes = {
      sm: "h-5 px-2 text-xs",
      md: "h-6 px-3 text-sm",
    };

    return (
      <span
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {children}
      </span>
    );
  }
);

Badge.displayName = "Badge";

export { Badge };
