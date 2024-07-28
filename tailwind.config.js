/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}", // Adjust as needed for your project structure
  ],
  theme: {
    extend: {
      colors: {
        'c-dark': '#2d2d28',
        'c-light': '#64645a',
        'c-light-white': 'c8c8be',
        'c-white': '#fffff0',
        'c-dark-white': '#c8c8be',
      },
    },
  },
  plugins: [],
}
