import React, { useState, useEffect } from 'react';
import { DollarSign } from 'lucide-react';

interface PriceInputProps {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  placeholder?: string;
  required?: boolean;
  currency?: string;
  label?: string;
}

export function PriceInput({
  value,
  onChange,
  placeholder = '0.00',
  required = false,
  currency = 'USD',
  label,
}: PriceInputProps) {
  const [inputValue, setInputValue] = useState<string>(
    value !== undefined ? value.toFixed(2) : ''
  );

  useEffect(() => {
    if (value !== undefined) {
      setInputValue(value.toFixed(2));
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;

    // Allow empty
    if (raw === '') {
      setInputValue('');
      onChange(undefined);
      return;
    }

    // Allow valid number patterns
    if (/^\d*\.?\d{0,2}$/.test(raw)) {
      setInputValue(raw);
      const num = parseFloat(raw);
      if (!isNaN(num)) {
        onChange(num);
      }
    }
  };

  const handleBlur = () => {
    if (inputValue === '') {
      onChange(undefined);
      return;
    }

    const num = parseFloat(inputValue);
    if (!isNaN(num)) {
      setInputValue(num.toFixed(2));
      onChange(num);
    }
  };

  const currencySymbol = currency === 'USD' ? '$' : currency;

  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-protocol-text mb-2">
          {label}
          {required && <span className="text-protocol-danger ml-1">*</span>}
        </label>
      )}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <span className="text-protocol-text-muted">{currencySymbol}</span>
        </div>
        <input
          type="text"
          inputMode="decimal"
          value={inputValue}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          required={required}
          className="w-full pl-8 pr-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border
                     text-protocol-text placeholder:text-protocol-text-muted/50
                     focus:outline-none focus:ring-2 focus:ring-protocol-accent"
        />
      </div>
    </div>
  );
}

// Compact version for inline use
interface CompactPriceInputProps {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  placeholder?: string;
}

export function CompactPriceInput({
  value,
  onChange,
  placeholder = '0',
}: CompactPriceInputProps) {
  const [inputValue, setInputValue] = useState<string>(
    value !== undefined ? value.toString() : ''
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === '' || /^\d*\.?\d{0,2}$/.test(raw)) {
      setInputValue(raw);
      const num = parseFloat(raw);
      onChange(isNaN(num) ? undefined : num);
    }
  };

  return (
    <div className="relative inline-flex items-center">
      <DollarSign className="w-4 h-4 text-protocol-text-muted mr-1" />
      <input
        type="text"
        inputMode="decimal"
        value={inputValue}
        onChange={handleChange}
        placeholder={placeholder}
        className="w-20 px-2 py-1 rounded bg-protocol-surface border border-protocol-border
                   text-protocol-text text-sm
                   focus:outline-none focus:ring-1 focus:ring-protocol-accent"
      />
    </div>
  );
}
