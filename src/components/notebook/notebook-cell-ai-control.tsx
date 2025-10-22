"use client";

import * as React from "react";
import { Sparkles, ArrowRight, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

interface NotebookAiEditButtonProps {
  isActive?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onHoverChange?: (hovering: boolean) => void;
}

export function NotebookAiEditButton({
  isActive = false,
  disabled = false,
  ariaLabel = "Edit cell with AI",
  onClick,
  onHoverChange,
}: NotebookAiEditButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={isActive}
      aria-label={ariaLabel}
      disabled={disabled}
      className={cn(
        "group relative inline-flex h-6 w-6 items-center justify-center overflow-hidden rounded-md border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-purple-300",
        disabled
          ? "cursor-not-allowed opacity-40"
          : "border-purple-100 bg-white shadow-sm hover:-translate-y-[1px] hover:shadow-[0_8px_18px_-10px_rgba(139,92,246,0.8)]"
      )}
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
      onFocus={() => onHoverChange?.(true)}
      onBlur={() => onHoverChange?.(false)}
      onClick={(event) => {
        if (disabled) return;
        onClick?.(event);
      }}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-0 rounded-md bg-[radial-gradient(circle_at_25%_20%,rgba(251,191,36,0.45),transparent_55%),radial-gradient(circle_at_80%_15%,rgba(167,139,250,0.65),transparent_60%),radial-gradient(circle_at_50%_80%,rgba(251,113,133,0.55),transparent_60%)] transition-opacity duration-300",
          isActive ? "opacity-100" : "opacity-90 group-hover:opacity-100"
        )}
      />
      <span
        aria-hidden
        className="absolute inset-0 rounded-md bg-gradient-to-br from-white/90 via-white/40 to-white/10 opacity-70"
      />
      <Sparkles
        aria-hidden
        className={cn(
          "relative z-10 size-3.5 text-purple-600 transition-transform duration-300",
          disabled ? "" : "group-hover:-translate-y-[1px] group-hover:rotate-6 group-active:scale-95",
          isActive ? "scale-[1.05]" : ""
        )}
      />
      <span
        aria-hidden
        className={cn(
          "absolute inset-0 z-0 rounded-md bg-purple-200/60 opacity-0 blur-md transition-opacity duration-300",
          (isActive || !disabled) && "group-hover:opacity-100",
          isActive && "opacity-100"
        )}
      />
    </button>
  );
}

interface NotebookAiPromptProps {
  value: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void | Promise<void>;
  isSubmitting?: boolean;
  className?: string;
  onHeightChange?: (height: number) => void;
}

const NotebookAiPromptComponent = React.forwardRef<HTMLTextAreaElement, NotebookAiPromptProps>(
  ({ value, onChange, onCancel, onSubmit, isSubmitting = false, className, onHeightChange }, forwardedRef) => {
    const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
    const [localValue, setLocalValue] = React.useState(value);
    const heightChangeTimeoutRef = React.useRef<NodeJS.Timeout | undefined>(undefined);

    React.useImperativeHandle(forwardedRef, () => textareaRef.current as HTMLTextAreaElement);

    // Sync external value changes to local state
    React.useEffect(() => {
      setLocalValue(value);
    }, [value]);

    // Auto-resize textarea based on content
    const autoResize = React.useCallback(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      // Store cursor position before resize
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      // Reset height to auto to get the correct scrollHeight
      textarea.style.height = 'auto';

      // Set the height to match content, respecting min/max
      const newHeight = Math.min(Math.max(textarea.scrollHeight, 60), 200);
      textarea.style.height = `${newHeight}px`;

      // Don't restore cursor - parent effect will handle it

      // Debounce height change notifications
      if (onHeightChange) {
        if (heightChangeTimeoutRef.current) {
          clearTimeout(heightChangeTimeoutRef.current);
        }
        heightChangeTimeoutRef.current = setTimeout(() => {
          onHeightChange(newHeight);
        }, 100); // Increased debounce to reduce updates
      }
    }, [onHeightChange]);

    // Initial setup
    React.useEffect(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      // Focus on mount
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);

      // Initial resize
      autoResize();

      return () => {
        if (heightChangeTimeoutRef.current) {
          clearTimeout(heightChangeTimeoutRef.current);
        }
      };
    }, [autoResize]);

    // Resize on local value change
    React.useEffect(() => {
      autoResize();
    }, [localValue, autoResize]);

    const handleKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Cmd/Ctrl+Enter to submit
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        onSubmit();
        return;
      }

      // Escape to cancel
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
        return;
      }

      // Plain Enter - prevent any default form submission behavior
      if (event.key === "Enter") {
        event.stopPropagation();
        // Allow default textarea behavior (insert newline)
      }
    }, [onSubmit, onCancel]);

    const handleChange = React.useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = event.target.value;
      setLocalValue(newValue);
      onChange(newValue);
    }, [onChange]);

    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        className={cn(
          "relative w-full",
          "rounded-lg border border-slate-700/50 bg-[#1a1f26] p-2.5",
          className
        )}
      >
        <textarea
          ref={textareaRef}
          value={localValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder=""
          className="w-full resize-none rounded border-0 bg-transparent px-0 py-0 text-sm text-slate-300 placeholder:text-slate-600 outline-none focus:ring-0 overflow-hidden"
          style={{
            lineHeight: '1.5',
            minHeight: '60px',
            height: 'auto',
            maxHeight: '200px'
          }}
        />
        <div className="mt-2 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
            <span className="ml-2 text-[10px] opacity-60">ESC</span>
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-6 px-2.5 text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-200 disabled:opacity-50"
            onClick={onSubmit}
            disabled={isSubmitting || !value.trim()}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 size-3 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                Generate
                <span className="ml-2 text-[10px] opacity-60">⌘⏎</span>
              </>
            )}
          </Button>
        </div>
      </form>
    );
  }
);

NotebookAiPromptComponent.displayName = "NotebookAiPrompt";

// Memoize the component to prevent unnecessary re-renders
export const NotebookAiPrompt = React.memo(NotebookAiPromptComponent);
