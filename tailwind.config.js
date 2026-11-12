/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          // Deep Navy Blue
          navy: '#0B1F5C',
          'navy-light': '#153185',
          'navy-dark': '#07153F',

          // Soft Pink
          pink: '#E84D8A',
          'pink-hover': '#D93B78',
          'pink-light': '#FDF2F7',

          // Warm Cream
          cream: '#F8F3EE',
          'cream-dark': '#EEE7DE',

          DEFAULT: '#0B1F5C',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
