/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: '#142b45',
        gold: '#b99a62',
        amber: {
          300: '#edbd70',
        },
        ink: '#333b45',
        paper: '#f3f5f7',
      },
      fontFamily: {
        sans: ['Inter', 'DM Sans', 'sans-serif'],
        display: ['Manrope', 'sans-serif'],
        serif: ['Fraunces', 'Playfair Display', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
}
