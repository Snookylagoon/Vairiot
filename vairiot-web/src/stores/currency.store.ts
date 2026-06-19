import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CurrencyInfo {
  code: string;
  symbol: string;
  name: string;
  locale: string;
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: 'GBP', symbol: '£',    name: 'British Pound',         locale: 'en-GB' },
  { code: 'USD', symbol: '$',    name: 'US Dollar',             locale: 'en-US' },
  { code: 'EUR', symbol: '€',    name: 'Euro',                  locale: 'de-DE' },
  { code: 'JPY', symbol: '¥',    name: 'Japanese Yen',          locale: 'ja-JP' },
  { code: 'CHF', symbol: 'CHF',  name: 'Swiss Franc',           locale: 'de-CH' },
  { code: 'CAD', symbol: 'C$',   name: 'Canadian Dollar',       locale: 'en-CA' },
  { code: 'AUD', symbol: 'A$',   name: 'Australian Dollar',     locale: 'en-AU' },
  { code: 'NZD', symbol: 'NZ$',  name: 'New Zealand Dollar',    locale: 'en-NZ' },
  { code: 'CNY', symbol: '¥',    name: 'Chinese Yuan',          locale: 'zh-CN' },
  { code: 'INR', symbol: '₹',    name: 'Indian Rupee',          locale: 'en-IN' },
  { code: 'SGD', symbol: 'S$',   name: 'Singapore Dollar',      locale: 'en-SG' },
  { code: 'HKD', symbol: 'HK$',  name: 'Hong Kong Dollar',      locale: 'en-HK' },
  { code: 'KRW', symbol: '₩',    name: 'South Korean Won',      locale: 'ko-KR' },
  { code: 'SEK', symbol: 'kr',   name: 'Swedish Krona',         locale: 'sv-SE' },
  { code: 'NOK', symbol: 'kr',   name: 'Norwegian Krone',       locale: 'nb-NO' },
  { code: 'DKK', symbol: 'kr',   name: 'Danish Krone',          locale: 'da-DK' },
  { code: 'PLN', symbol: 'zł',   name: 'Polish Zloty',          locale: 'pl-PL' },
  { code: 'ZAR', symbol: 'R',    name: 'South African Rand',    locale: 'en-ZA' },
  { code: 'BRL', symbol: 'R$',   name: 'Brazilian Real',        locale: 'pt-BR' },
  { code: 'MXN', symbol: 'MX$',  name: 'Mexican Peso',          locale: 'es-MX' },
  { code: 'AED', symbol: 'AED',  name: 'UAE Dirham',            locale: 'ar-AE' },
  { code: 'SAR', symbol: 'SAR',  name: 'Saudi Riyal',           locale: 'ar-SA' },
  { code: 'TRY', symbol: '₺',    name: 'Turkish Lira',          locale: 'tr-TR' },
  { code: 'THB', symbol: '฿',    name: 'Thai Baht',             locale: 'th-TH' },
  { code: 'MYR', symbol: 'RM',   name: 'Malaysian Ringgit',     locale: 'ms-MY' },
  { code: 'IDR', symbol: 'Rp',   name: 'Indonesian Rupiah',     locale: 'id-ID' },
  { code: 'PHP', symbol: '₱',    name: 'Philippine Peso',       locale: 'en-PH' },
  { code: 'TWD', symbol: 'NT$',  name: 'Taiwan Dollar',         locale: 'zh-TW' },
  { code: 'ILS', symbol: '₪',    name: 'Israeli Shekel',        locale: 'he-IL' },
  { code: 'CZK', symbol: 'Kč',   name: 'Czech Koruna',          locale: 'cs-CZ' },
  { code: 'HUF', symbol: 'Ft',   name: 'Hungarian Forint',      locale: 'hu-HU' },
  { code: 'RUB', symbol: '₽',    name: 'Russian Ruble',         locale: 'ru-RU' },
  { code: 'CLP', symbol: 'CL$',  name: 'Chilean Peso',          locale: 'es-CL' },
  { code: 'COP', symbol: 'CO$',  name: 'Colombian Peso',        locale: 'es-CO' },
  { code: 'ARS', symbol: 'AR$',  name: 'Argentine Peso',        locale: 'es-AR' },
  { code: 'NGN', symbol: '₦',    name: 'Nigerian Naira',        locale: 'en-NG' },
  { code: 'KES', symbol: 'KSh',  name: 'Kenyan Shilling',       locale: 'en-KE' },
  { code: 'EGP', symbol: 'E£',   name: 'Egyptian Pound',        locale: 'ar-EG' },
  { code: 'QAR', symbol: 'QR',   name: 'Qatari Riyal',          locale: 'ar-QA' },
  { code: 'KWD', symbol: 'KD',   name: 'Kuwaiti Dinar',         locale: 'ar-KW' },
  { code: 'BHD', symbol: 'BD',   name: 'Bahraini Dinar',        locale: 'ar-BH' },
  { code: 'OMR', symbol: 'OMR',  name: 'Omani Rial',            locale: 'ar-OM' },
];

interface CurrencyState {
  currencyCode: string;
  setCurrency: (code: string) => void;
}

export const useCurrencyStore = create<CurrencyState>()(
  persist(
    (set) => ({
      currencyCode: 'GBP',
      setCurrency: (code: string) => set({ currencyCode: code }),
    }),
    { name: 'vairiot-currency' },
  ),
);

export function getCurrencyInfo(code: string): CurrencyInfo {
  return CURRENCIES.find(c => c.code === code) ?? CURRENCIES[0];
}

export function formatCurrency(value: number | string | null | undefined, code: string, decimals: 2 | 0 = 2): string {
  if (value == null) return '—';
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(n)) return '—';
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: code,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
