'use client';

import type { ChangeEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type Option = { label: string; value: string };

type FilterSelectProps = {
  name: string;
  value: string;
  options: Option[];
  placeholder?: string;
  variant?: 'native' | 'menu';
  clearValue?: string;
  className?: string;
};

type FilterSearchInputProps = {
  name: string;
  value: string;
  placeholder?: string;
  className?: string;
  debounceMs?: number;
};

export function FilterSelect({
  name,
  value,
  options,
  placeholder,
  variant = 'native',
  clearValue = 'all',
  className
}: FilterSelectProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const queryString = searchParams.toString();
  const isEmptySelection = !value || value === clearValue;

  const updateParam = (nextValue: string) => {
    const nextParams = new URLSearchParams(queryString);
    if (!nextValue || nextValue === clearValue) {
      nextParams.delete(name);
    } else {
      nextParams.set(name, nextValue);
    }
    const query = nextParams.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    updateParam(event.target.value);
  };

  useEffect(() => {
    if (!open) return;

    const handleOutsideClick = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!wrapperRef.current?.contains(target)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [pathname, queryString]);

  const selected = useMemo(() => {
    if (isEmptySelection) return undefined;
    return options.find((option) => option.value === value);
  }, [isEmptySelection, options, value]);

  const wrapperClass = className ? `select ${className}` : 'select';

  if (variant === 'menu') {
    const triggerLabel = selected?.label || placeholder || options[0]?.label || '';
    return (
      <div
        ref={wrapperRef}
        className={`${wrapperClass} menu-select${open ? ' open' : ''}${selected ? ' has-value' : ''}`}
      >
        <button
          type="button"
          className={`menu-select-trigger${!selected && placeholder ? ' placeholder' : ''}`}
          onClick={() => setOpen((prev) => !prev)}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span>{triggerLabel}</span>
          <strong>⌄</strong>
        </button>
        {open ? (
          <div className="menu-select-menu" role="listbox" aria-label={name}>
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`menu-select-option${option.value === value ? ' active' : ''}`}
                onClick={() => {
                  setOpen(false);
                  const nextValue =
                    placeholder && option.value === value ? clearValue : option.value;
                  updateParam(nextValue);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  const nativeValue = placeholder ? (isEmptySelection ? '' : value) : value || clearValue;

  return (
    <div className={wrapperClass}>
      <select name={name} value={nativeValue} onChange={handleChange}>
        {placeholder ? (
          <option value="" disabled hidden>
            {placeholder}
          </option>
        ) : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <strong>▾</strong>
    </div>
  );
}

export function FilterSearchInput({
  name,
  value,
  placeholder = 'Buscar...',
  className,
  debounceMs = 250
}: FilterSearchInputProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const [inputValue, setInputValue] = useState(value);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextValue = inputValue.trim();
      const nextParams = new URLSearchParams(queryString);
      const currentValue = (nextParams.get(name) || '').trim();
      if (currentValue === nextValue) return;
      if (!nextValue) {
        nextParams.delete(name);
      } else {
        nextParams.set(name, nextValue);
      }
      const query = nextParams.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
    }, debounceMs);

    return () => window.clearTimeout(timer);
  }, [debounceMs, inputValue, name, pathname, queryString, router]);

  return (
    <label className={className ? `search ${className}` : 'search'}>
      <span aria-hidden="true">🔍</span>
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={inputValue}
        onChange={(event) => setInputValue(event.target.value)}
      />
    </label>
  );
}
