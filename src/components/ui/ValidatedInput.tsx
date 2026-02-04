/**
 * Validated Input Component
 * 
 * Number input with real-time validation and error display.
 */

import React, { useEffect, useState } from "react";

interface ValidatedInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label: string;
  suffix?: string;
  className?: string;
}

export function ValidatedInput({
  value,
  onChange,
  min = 0,
  max = 10000,
  label,
  suffix,
  className = "",
}: ValidatedInputProps) {
  const [localValue, setLocalValue] = useState(String(value));
  const [error, setError] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Sync with external value when not focused
  useEffect(() => {
    if (!isFocused) {
      setLocalValue(String(value));
    }
  }, [value, isFocused]);

  const validate = (raw: string): { valid: boolean; num: number; error: string | null } => {
    const num = parseInt(raw);
    
    if (raw === "" || raw === "-") {
      return { valid: false, num: 0, error: null }; // Allow typing
    }
    if (isNaN(num)) {
      return { valid: false, num: 0, error: "Enter a number" };
    }
    if (num < min) {
      return { valid: false, num, error: `Min: ${min}` };
    }
    if (num > max) {
      return { valid: false, num, error: `Max: ${max}` };
    }
    return { valid: true, num, error: null };
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setLocalValue(raw);
    
    const { valid, num, error } = validate(raw);
    setError(error);
    
    if (valid) {
      onChange(num);
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    
    // Reset to valid value on blur
    const { valid, num } = validate(localValue);
    if (!valid) {
      const clampedValue = Math.max(min, Math.min(max, isNaN(num) ? value : num));
      setLocalValue(String(clampedValue));
      setError(null);
      onChange(clampedValue);
    }
  };

  const handleFocus = () => {
    setIsFocused(true);
  };

  const inputId = `input-${label.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <div className={className}>
      <label htmlFor={inputId} className="block text-xs text-gray-500 mb-1">
        {label}
        {suffix && <span className="text-gray-400 ml-1">({suffix})</span>}
      </label>
      <div className="relative">
        <input
          id={inputId}
          type="number"
          value={localValue}
          onChange={handleChange}
          onBlur={handleBlur}
          onFocus={handleFocus}
          min={min}
          max={max}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className={`w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 transition-colors ${
            error
              ? "border-red-300 focus:ring-red-500 focus:border-red-500"
              : "border-gray-300 focus:ring-blue-500 focus:border-blue-500"
          }`}
        />
        {error && (
          <p id={`${inputId}-error`} className="absolute text-xs text-red-500 mt-0.5">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

// Simple inline validated input for compact layouts
interface InlineValidatedInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label: string;
  ariaLabel?: string;
}

export function InlineValidatedInput({
  value,
  onChange,
  min = 0,
  max = 10000,
  label,
  ariaLabel,
}: InlineValidatedInputProps) {
  const [localValue, setLocalValue] = useState(String(value));

  useEffect(() => {
    setLocalValue(String(value));
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setLocalValue(raw);
    
    const num = parseInt(raw);
    if (!isNaN(num) && num >= min && num <= max) {
      onChange(num);
    }
  };

  const handleBlur = () => {
    const num = parseInt(localValue);
    const clampedValue = isNaN(num) ? value : Math.max(min, Math.min(max, num));
    setLocalValue(String(clampedValue));
    if (clampedValue !== value) {
      onChange(clampedValue);
    }
  };

  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <input
        type="number"
        value={localValue}
        onChange={handleChange}
        onBlur={handleBlur}
        min={min}
        max={max}
        aria-label={ariaLabel || label}
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}
