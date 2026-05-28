import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../utils';

interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  className?: string;
  title?: string;
  placeholder?: string;
}

export default function Combobox({ value, onChange, options, className, title, placeholder }: ComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative w-full" ref={containerRef}>
      <div className="flex items-center relative">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className={cn(
            "bg-transparent border-none focus:ring-2 focus:ring-indigo-500/20 rounded px-2 py-1 w-full transition-all outline-none pr-6 placeholder:font-sans placeholder:text-slate-300",
            className
          )}
          title={title}
        />
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-sm"
        >
          <ChevronDown size={14} />
        </button>
      </div>
      
      {isOpen && options.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-auto py-1">
          {options.map((option, idx) => (
            <button
              key={idx}
              type="button"
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 text-slate-700 transition-colors"
              onClick={() => {
                onChange(option);
                setIsOpen(false);
              }}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
