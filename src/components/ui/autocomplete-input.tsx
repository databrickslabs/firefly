"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverAnchor,
} from "@/components/ui/popover";

export interface AutocompleteOption {
  value: string;
  label: string;
  description?: string;
}

interface AutocompleteInputProps {
  options: AutocompleteOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyMessage?: string;
  className?: string;
  inputClassName?: string;
}

// Delimiter characters that separate tokens in expressions
const TOKEN_DELIMITERS = /[(),\s+\-*/<>=!]/;

/**
 * Extract the token at cursor position for autocomplete filtering
 * e.g., "avg(cust" with cursor at end -> returns { token: "cust", start: 4, end: 8 }
 */
function getTokenAtCursor(
  text: string,
  cursorPos: number
): { token: string; start: number; end: number } {
  // Find the start of the token (search backwards from cursor)
  let start = cursorPos;
  while (start > 0 && !TOKEN_DELIMITERS.test(text[start - 1])) {
    start--;
  }

  // Find the end of the token (search forwards from cursor)
  let end = cursorPos;
  while (end < text.length && !TOKEN_DELIMITERS.test(text[end])) {
    end++;
  }

  return {
    token: text.slice(start, end),
    start,
    end,
  };
}

export function AutocompleteInput({
  options,
  value,
  onChange,
  placeholder = "Type or select...",
  emptyMessage = "No suggestions",
  className,
  inputClassName,
}: AutocompleteInputProps) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState(value);
  const [cursorPosition, setCursorPosition] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Sync inputValue with external value
  React.useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Get the current token at cursor for filtering
  const tokenInfo = React.useMemo(() => {
    return getTokenAtCursor(inputValue, cursorPosition);
  }, [inputValue, cursorPosition]);

  // Filter options based on the token at cursor
  const filteredOptions = React.useMemo(() => {
    const search = tokenInfo.token.toLowerCase();
    if (!search) {
      return options;
    }
    return options.filter(
      (opt) =>
        opt.value.toLowerCase().includes(search) ||
        opt.label.toLowerCase().includes(search)
    );
  }, [options, tokenInfo.token]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    const newCursorPos = e.target.selectionStart ?? newValue.length;
    setInputValue(newValue);
    setCursorPosition(newCursorPos);
    onChange(newValue);
    if (!open) {
      setOpen(true);
    }
  };

  const handleSelect = (selectedValue: string) => {
    // Insert the selected value at cursor position, replacing the current token
    const before = inputValue.slice(0, tokenInfo.start);
    const after = inputValue.slice(tokenInfo.end);
    const newValue = before + selectedValue + after;
    const newCursorPos = tokenInfo.start + selectedValue.length;

    setInputValue(newValue);
    setCursorPosition(newCursorPos);
    onChange(newValue);
    setOpen(false);

    // Focus and set cursor position after the inserted value
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  const handleFocus = () => {
    // Update cursor position on focus
    if (inputRef.current) {
      setCursorPosition(inputRef.current.selectionStart ?? inputValue.length);
    }
    setOpen(true);
  };

  const handleClick = () => {
    // Update cursor position on click
    if (inputRef.current) {
      setCursorPosition(inputRef.current.selectionStart ?? inputValue.length);
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Update cursor position on key navigation (arrows, home, end)
    const target = e.target as HTMLInputElement;
    setCursorPosition(target.selectionStart ?? inputValue.length);
  };

  const handleBlur = (e: React.FocusEvent) => {
    // Delay closing to allow click on popover item
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (relatedTarget?.closest("[data-autocomplete-popover]")) {
      return;
    }
    setTimeout(() => setOpen(false), 150);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
    }
  };

  // Show popover when open, regardless of options count
  const showPopover = open;

  return (
    <Popover open={showPopover} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className={cn("relative", className)}>
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={handleInputChange}
            onFocus={handleFocus}
            onClick={handleClick}
            onKeyUp={handleKeyUp}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className={cn("h-9 text-sm font-mono", inputClassName)}
            autoComplete="off"
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
        data-autocomplete-popover
      >
        <Command>
          <CommandList>
            {filteredOptions.length === 0 ? (
              <CommandEmpty className="py-3 text-center text-xs text-muted-foreground">
                {options.length === 0
                  ? "No columns available. Connect a source node with a selected table."
                  : emptyMessage}
              </CommandEmpty>
            ) : (
              <CommandGroup>
                {filteredOptions.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onSelect={() => handleSelect(option.value)}
                    className="cursor-pointer"
                  >
                    <div className="flex flex-col">
                      <span className="font-mono text-sm">{option.label}</span>
                      {option.description && (
                        <span className="text-xs text-muted-foreground">
                          {option.description.length > 30
                            ? `${option.description.slice(0, 30)}...`
                            : option.description}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
