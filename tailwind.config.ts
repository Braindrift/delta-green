import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        desk: '#181816',
        'desk-edge': '#0f0f0e',
        'desk-groove': '#0a0a09',
        paper: '#d6cab0',
        'paper-worn': '#c4b596',
        'paper-dark': '#a89878',
        'paper-aged': '#b8a882',
        ink: '#1a1a16',
        'ink-faded': '#38362e',
        'green-void': '#131a13',
        'green-dim': '#243324',
        'green-mid': '#385435',
        'green-bright': '#567c52',
        'green-accent': '#74b06e',
        'green-glow': '#8dd688',
        'red-stamp': '#922020',
        'red-faded': '#5c1818',
        amber: '#c4902a',
        'amber-dim': '#7a5818',
      },
      fontFamily: {
        ui: ['"Share Tech Mono"', 'monospace'],
        display: ['Oswald', 'sans-serif'],
        body: ['"Courier Prime"', '"Courier New"', 'monospace'],
        stamp: ['"Special Elite"', 'cursive'],
      },
    },
  },
  plugins: [],
} satisfies Config;