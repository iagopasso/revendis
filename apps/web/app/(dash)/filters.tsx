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

    const handleOutsideClick = (event: MouseEvent) => {
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

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
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
      <div ref={wrapperRef} className={`${wrapperClass} menu-select${open ? ' open' : ''}`}>
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
