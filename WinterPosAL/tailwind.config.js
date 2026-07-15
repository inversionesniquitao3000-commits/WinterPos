/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Courier New', 'monospace'],
        sans: ['Outfit', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        winter: {
          bg: '#f5f8fa',
          text: '#333333',
          header: '#0f3562',
          tabBar: '#112d4e',
          yellow: '#e4fd3d',
          gold: '#ffd700',
          blueBtn: '#0b5fa5',
          blueBtnHover: '#084c85',
          
          // Tab gradients & colors
          cajaStart: '#074080',
          cajaEnd: '#0d5aa5',
          
          inventarioStart: '#7c1232',
          inventarioEnd: '#a01d44',
          
          ventasStart: '#132148',
          ventasEnd: '#1e3573',
          
          clientesStart: '#116265',
          clientesEnd: '#1b8589',
          
          configStart: '#10624d',
          configEnd: '#18896c',
        }
      }
    },
  },
  plugins: [],
}
