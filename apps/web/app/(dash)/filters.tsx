'use client';

import type { ChangeEvent } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type Option = { label: string; value: string };

type FilterSelectProps = {
  name: string;
  value: string;
  options: Option[];
};

export function FilterSelect({ name, value, options }: FilterSelectProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextValue = event.target.value;
    const nextParams = new URLSearchParams(searchParams.toString());
    if (!nextValue || nextValue === 'all') {
      nextParams.delete(name);
    } else {
      nextParams.set(name, nextValue);
    }
    const query = nextParams.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };

  return (
    <div className="select">
      <select name={name} value={value} onChange={handleChange}>
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
