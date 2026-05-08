/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#EBF5FB',
          100: '#D6EAF8',
          200: '#AED6F1',
          500: '#2E86C1',
          700: '#1B4F72',
          900: '#0D2535',
        },
        success: '#27AE60',
        warning: '#F39C12',
        danger:  '#E74C3C',
      },
    },
  },
  plugins: [],
};
