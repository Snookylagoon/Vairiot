/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'v-pink':    '#FF0DCC',
        'v-mauve':   '#A05B97',
        'v-violet':  '#615AA0',
        'v-charcoal':'#2B3132',
        'v-wash':    '#F8F0FA',
      },
      fontFamily: {
        sans: ['Montserrat', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
      backgroundImage: {
        'v-gradient': 'linear-gradient(90deg, #FF0DCC 0%, #A05B97 50%, #615AA0 100%)',
      },
      fontSize: {
        'display': ['3.5rem', { lineHeight: '1.1', fontWeight: '800' }],
        'h1':      ['1.5rem',  { lineHeight: '1.3', fontWeight: '700' }],
        'h2':      ['1.25rem', { lineHeight: '1.4', fontWeight: '700' }],
        'h3':      ['1rem',    { lineHeight: '1.5', fontWeight: '600' }],
      },
      boxShadow: {
        'v-card': '0 2px 8px 0 rgba(97, 90, 160, 0.12)',
        'v-focus': '0 0 0 3px rgba(255, 13, 204, 0.25)',
      },
      borderRadius: {
        'v': '0.5rem',
      },
    },
  },
  plugins: [],
};
