export interface Country {
  name: string;
  code: string;
  region: string;
}

export const COUNTRIES: Country[] = [
  // Africa
  { name: 'Algeria', code: 'DZ', region: 'Africa' },
  { name: 'Angola', code: 'AO', region: 'Africa' },
  { name: 'Botswana', code: 'BW', region: 'Africa' },
  { name: 'Cameroon', code: 'CM', region: 'Africa' },
  { name: 'Congo (DRC)', code: 'CD', region: 'Africa' },
  { name: 'Côte d\'Ivoire', code: 'CI', region: 'Africa' },
  { name: 'Egypt', code: 'EG', region: 'Africa' },
  { name: 'Ethiopia', code: 'ET', region: 'Africa' },
  { name: 'Ghana', code: 'GH', region: 'Africa' },
  { name: 'Kenya', code: 'KE', region: 'Africa' },
  { name: 'Libya', code: 'LY', region: 'Africa' },
  { name: 'Madagascar', code: 'MG', region: 'Africa' },
  { name: 'Morocco', code: 'MA', region: 'Africa' },
  { name: 'Mozambique', code: 'MZ', region: 'Africa' },
  { name: 'Nigeria', code: 'NG', region: 'Africa' },
  { name: 'Rwanda', code: 'RW', region: 'Africa' },
  { name: 'Senegal', code: 'SN', region: 'Africa' },
  { name: 'South Africa', code: 'ZA', region: 'Africa' },
  { name: 'Tanzania', code: 'TZ', region: 'Africa' },
  { name: 'Tunisia', code: 'TN', region: 'Africa' },
  { name: 'Uganda', code: 'UG', region: 'Africa' },
  { name: 'Zambia', code: 'ZM', region: 'Africa' },
  { name: 'Zimbabwe', code: 'ZW', region: 'Africa' },

  // Asia
  { name: 'Bangladesh', code: 'BD', region: 'Asia' },
  { name: 'Cambodia', code: 'KH', region: 'Asia' },
  { name: 'China', code: 'CN', region: 'Asia' },
  { name: 'Hong Kong', code: 'HK', region: 'Asia' },
  { name: 'India', code: 'IN', region: 'Asia' },
  { name: 'Indonesia', code: 'ID', region: 'Asia' },
  { name: 'Japan', code: 'JP', region: 'Asia' },
  { name: 'Kazakhstan', code: 'KZ', region: 'Asia' },
  { name: 'Malaysia', code: 'MY', region: 'Asia' },
  { name: 'Mongolia', code: 'MN', region: 'Asia' },
  { name: 'Myanmar', code: 'MM', region: 'Asia' },
  { name: 'Nepal', code: 'NP', region: 'Asia' },
  { name: 'Pakistan', code: 'PK', region: 'Asia' },
  { name: 'Philippines', code: 'PH', region: 'Asia' },
  { name: 'Singapore', code: 'SG', region: 'Asia' },
  { name: 'South Korea', code: 'KR', region: 'Asia' },
  { name: 'Sri Lanka', code: 'LK', region: 'Asia' },
  { name: 'Taiwan', code: 'TW', region: 'Asia' },
  { name: 'Thailand', code: 'TH', region: 'Asia' },
  { name: 'Uzbekistan', code: 'UZ', region: 'Asia' },
  { name: 'Vietnam', code: 'VN', region: 'Asia' },

  // Europe
  { name: 'Austria', code: 'AT', region: 'Europe' },
  { name: 'Belgium', code: 'BE', region: 'Europe' },
  { name: 'Bulgaria', code: 'BG', region: 'Europe' },
  { name: 'Croatia', code: 'HR', region: 'Europe' },
  { name: 'Czech Republic', code: 'CZ', region: 'Europe' },
  { name: 'Denmark', code: 'DK', region: 'Europe' },
  { name: 'Finland', code: 'FI', region: 'Europe' },
  { name: 'France', code: 'FR', region: 'Europe' },
  { name: 'Germany', code: 'DE', region: 'Europe' },
  { name: 'Greece', code: 'GR', region: 'Europe' },
  { name: 'Hungary', code: 'HU', region: 'Europe' },
  { name: 'Iceland', code: 'IS', region: 'Europe' },
  { name: 'Ireland', code: 'IE', region: 'Europe' },
  { name: 'Italy', code: 'IT', region: 'Europe' },
  { name: 'Luxembourg', code: 'LU', region: 'Europe' },
  { name: 'Netherlands', code: 'NL', region: 'Europe' },
  { name: 'Norway', code: 'NO', region: 'Europe' },
  { name: 'Poland', code: 'PL', region: 'Europe' },
  { name: 'Portugal', code: 'PT', region: 'Europe' },
  { name: 'Romania', code: 'RO', region: 'Europe' },
  { name: 'Serbia', code: 'RS', region: 'Europe' },
  { name: 'Slovakia', code: 'SK', region: 'Europe' },
  { name: 'Slovenia', code: 'SI', region: 'Europe' },
  { name: 'Spain', code: 'ES', region: 'Europe' },
  { name: 'Sweden', code: 'SE', region: 'Europe' },
  { name: 'Switzerland', code: 'CH', region: 'Europe' },
  { name: 'Turkey', code: 'TR', region: 'Europe' },
  { name: 'Ukraine', code: 'UA', region: 'Europe' },
  { name: 'United Kingdom', code: 'GB', region: 'Europe' },

  // Middle East
  { name: 'Bahrain', code: 'BH', region: 'Middle East' },
  { name: 'Iraq', code: 'IQ', region: 'Middle East' },
  { name: 'Israel', code: 'IL', region: 'Middle East' },
  { name: 'Jordan', code: 'JO', region: 'Middle East' },
  { name: 'Kuwait', code: 'KW', region: 'Middle East' },
  { name: 'Lebanon', code: 'LB', region: 'Middle East' },
  { name: 'Oman', code: 'OM', region: 'Middle East' },
  { name: 'Qatar', code: 'QA', region: 'Middle East' },
  { name: 'Saudi Arabia', code: 'SA', region: 'Middle East' },
  { name: 'United Arab Emirates', code: 'AE', region: 'Middle East' },
  { name: 'Yemen', code: 'YE', region: 'Middle East' },

  // North America
  { name: 'Canada', code: 'CA', region: 'North America' },
  { name: 'Costa Rica', code: 'CR', region: 'North America' },
  { name: 'Cuba', code: 'CU', region: 'North America' },
  { name: 'Dominican Republic', code: 'DO', region: 'North America' },
  { name: 'Guatemala', code: 'GT', region: 'North America' },
  { name: 'Honduras', code: 'HN', region: 'North America' },
  { name: 'Jamaica', code: 'JM', region: 'North America' },
  { name: 'Mexico', code: 'MX', region: 'North America' },
  { name: 'Panama', code: 'PA', region: 'North America' },
  { name: 'Puerto Rico', code: 'PR', region: 'North America' },
  { name: 'Trinidad and Tobago', code: 'TT', region: 'North America' },
  { name: 'United States', code: 'US', region: 'North America' },

  // Oceania
  { name: 'Australia', code: 'AU', region: 'Oceania' },
  { name: 'Fiji', code: 'FJ', region: 'Oceania' },
  { name: 'New Zealand', code: 'NZ', region: 'Oceania' },
  { name: 'Papua New Guinea', code: 'PG', region: 'Oceania' },

  // South America
  { name: 'Argentina', code: 'AR', region: 'South America' },
  { name: 'Bolivia', code: 'BO', region: 'South America' },
  { name: 'Brazil', code: 'BR', region: 'South America' },
  { name: 'Chile', code: 'CL', region: 'South America' },
  { name: 'Colombia', code: 'CO', region: 'South America' },
  { name: 'Ecuador', code: 'EC', region: 'South America' },
  { name: 'Paraguay', code: 'PY', region: 'South America' },
  { name: 'Peru', code: 'PE', region: 'South America' },
  { name: 'Uruguay', code: 'UY', region: 'South America' },
  { name: 'Venezuela', code: 'VE', region: 'South America' },
];

const REGION_ORDER = ['Africa', 'Asia', 'Europe', 'Middle East', 'North America', 'Oceania', 'South America'];

export interface CountryGroup {
  region: string;
  countries: Country[];
}

export function getGroupedCountries(): CountryGroup[] {
  return REGION_ORDER.map(region => ({
    region,
    countries: COUNTRIES
      .filter(c => c.region === region)
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

const FAVOURITES_KEY = 'vairiot_favourite_countries';
const MAX_FAVOURITES = 4;

export function getFavouriteCountries(): string[] {
  try {
    const stored = localStorage.getItem(FAVOURITES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function addFavouriteCountry(name: string): string[] {
  const favs = getFavouriteCountries().filter(f => f !== name);
  favs.unshift(name);
  const trimmed = favs.slice(0, MAX_FAVOURITES);
  localStorage.setItem(FAVOURITES_KEY, JSON.stringify(trimmed));
  return trimmed;
}
