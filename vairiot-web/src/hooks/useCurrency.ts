import { useCallback } from 'react';

import { useCurrencyStore, formatCurrency, getCurrencyInfo } from '@/stores/currency.store';

export function useCurrency() {
  const code = useCurrencyStore(s => s.currencyCode);
  const { symbol } = getCurrencyInfo(code);

  const fmt = useCallback(
    (value: number | string | null | undefined, decimals: 2 | 0 = 2) =>
      formatCurrency(value, code, decimals),
    [code],
  );

  return { code, symbol, fmt };
}
