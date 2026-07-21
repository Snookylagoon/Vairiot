import clsx from 'clsx';
import { ChevronDown, Star, Search } from 'lucide-react';
import { useState, useRef, useEffect, useMemo } from 'react';

import {
  COUNTRIES, getGroupedCountries, getFavouriteCountries, addFavouriteCountry,
} from '@/lib/countries';

interface CountrySelectProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
}

export function CountrySelect({ value, onChange, label, placeholder = 'Select country' }: CountrySelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [favourites, setFavourites] = useState(getFavouriteCountries);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (open && searchRef.current) searchRef.current.focus();
  }, [open]);

  const grouped = useMemo(() => getGroupedCountries(), []);

  const filtered = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    return COUNTRIES
      .filter(c => c.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [search]);

  const favCountries = useMemo(
    () => favourites.map(name => COUNTRIES.find(c => c.name === name)).filter(Boolean),
    [favourites],
  );

  const select = (name: string) => {
    onChange(name);
    setFavourites(addFavouriteCountry(name));
    setOpen(false);
    setSearch('');
  };

  return (
    <div className="relative space-y-1" ref={containerRef}>
      {label && <label className="block text-sm font-medium text-v-charcoal">{label}</label>}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={clsx(
          'flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm text-left',
          'focus:outline-none focus:ring-2 focus:ring-v-pink focus:border-transparent transition-colors',
          'border-gray-200 bg-white hover:border-gray-300',
          !value && 'text-gray-400',
        )}
      >
        <span className="truncate">{value || placeholder}</span>
        <ChevronDown size={14} className={clsx('ml-2 shrink-0 text-gray-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
            <Search size={14} className="shrink-0 text-gray-400" />
            <input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search countries…"
              className="w-full text-sm text-v-charcoal placeholder-gray-400 outline-none"
            />
          </div>

          <div className="max-h-64 overflow-y-auto overscroll-contain">
            {filtered ? (
              filtered.length === 0 ? (
                <p className="px-3 py-4 text-xs text-gray-400 text-center">No countries match your search.</p>
              ) : (
                filtered.map(c => (
                  <Option key={c.code} name={c.name} selected={c.name === value} onClick={() => select(c.name)} />
                ))
              )
            ) : (
              <>
                {favCountries.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 px-3 pt-2 pb-1">
                      <Star size={11} className="text-amber-400 fill-amber-400" />
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Favourites</span>
                    </div>
                    {favCountries.map(c => c && (
                      <Option key={`fav-${c.code}`} name={c.name} selected={c.name === value} onClick={() => select(c.name)} />
                    ))}
                    <div className="mx-3 border-b border-gray-100" />
                  </div>
                )}

                {grouped.map(g => (
                  <div key={g.region}>
                    <div className="px-3 pt-2 pb-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{g.region}</span>
                    </div>
                    {g.countries.map(c => (
                      <Option key={c.code} name={c.name} selected={c.name === value} onClick={() => select(c.name)} />
                    ))}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Option({ name, selected, onClick }: { name: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'flex w-full items-center px-3 py-1.5 text-sm text-left transition-colors',
        selected ? 'bg-v-pink/10 text-v-pink font-medium' : 'text-v-charcoal hover:bg-gray-50',
      )}
    >
      {name}
    </button>
  );
}
