import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f5ff',
          100: '#e0ebff',
          200: '#c7d7fe',
          300: '#a4bcfd',
          400: '#7c9bf8',
          500: '#536df1',
          600: '#3b4fe4',
          700: '#2f3ec7',
          800: '#2934a1',
          900: '#262f7f',
          950: '#181c4c',
        },
      },
    },
  },
  plugins: [],
};

export default config;
