/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        studio: {
          bg: '#0f172a',
          surface: '#1e293b',
          border: '#334155',
          primary: '#2563eb',
          accent: '#7c3aed'
        }
      }
    },
  },
  plugins: [],
}
