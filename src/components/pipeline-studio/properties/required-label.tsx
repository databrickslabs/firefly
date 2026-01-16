"use client";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface RequiredLabelProps {
  htmlFor?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

/**
 * A label component that shows a red asterisk for required fields
 */
export function RequiredLabel({
  htmlFor,
  required = false,
  children,
  className,
}: RequiredLabelProps) {
  return (
    <Label htmlFor={htmlFor} className={cn("flex items-center gap-1", className)}>
      {children}
      {required && <span className="text-red-500 text-xs">*</span>}
    </Label>
  );
}

/**
 * A helper component to show validation status for a field
 */
interface FieldValidationHintProps {
  isValid: boolean;
  message?: string;
}

export function FieldValidationHint({ isValid, message }: FieldValidationHintProps) {
  if (isValid) return null;

  return (
    <p className="text-xs text-amber-600 mt-1">
      {message || "This field is required"}
    </p>
  );
}
