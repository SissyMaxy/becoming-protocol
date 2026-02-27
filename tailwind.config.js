/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'protocol': {
          'bg': '#0b0a10',
          'surface': '#13121c',
          'surface-light': '#1b1a26',
          'border': '#2b2a3c',
          'text': '#e8e6ed',
          'text-muted': '#908da4',
          'text-warm': '#f5f0eb',
          'accent': '#a855f7',
          'accent-soft': '#c084fc',
          'success': '#22c55e',
          'warning': '#f59e0b',
          'danger': '#ef4444',
        },
        // Bambi Mode colors
        'bambi': {
          'bg': '#FFF0F5',
          'surface': '#FFE4EC',
          'surface-light': '#FFFFFF',
          'border': '#FFBCD9',
          'text': '#5C0439',
          'text-muted': '#B0086A',
          'accent': '#FF69B4',
          'accent-soft': '#FF8DC7',
          'success': '#FF69B4',
          'warning': '#E8A598',
          'danger': '#DB0A7B',
        },
        'pink': {
          50: '#FFF0F5',
          100: '#FFE4EC',
          200: '#FFBCD9',
          300: '#FF8DC7',
          400: '#FF69B4',
          500: '#FF1493',
          600: '#DB0A7B',
          700: '#B0086A',
          800: '#8A0655',
          900: '#5C0439',
        },
        'lavender': {
          100: '#F3E8FF',
          200: '#E9D5FF',
          300: '#D8B4FE',
          400: '#C084FC',
          500: '#A855F7',
        },
      },
      fontFamily: {
        'mono': ['JetBrains Mono', 'Fira Code', 'monospace'],
        'bambi': ['Quicksand', 'Nunito', 'Poppins', 'sans-serif'],
        'handler': ['Inter', 'Quicksand', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'bambi': '0 4px 20px rgba(255, 105, 180, 0.3)',
        'bambi-glow': '0 0 30px rgba(255, 105, 180, 0.4)',
        'bambi-lg': '0 10px 40px rgba(255, 105, 180, 0.35)',
      },
      animation: {
        'sparkle': 'sparkle 1.5s ease-in-out infinite',
        'float-hearts': 'floatHearts 3s ease-in-out infinite',
        'bambi-glow': 'bambiGlow 2s ease-in-out infinite',
        'bambi-bounce': 'bambiBounce 0.6s ease-out',
        'shimmer': 'shimmer 2s linear infinite',
        'ping-once': 'pingOnce 0.5s ease-out forwards',
      },
      keyframes: {
        sparkle: {
          '0%, 100%': { opacity: 1, transform: 'scale(1)' },
          '50%': { opacity: 0.5, transform: 'scale(1.2)' },
        },
        floatHearts: {
          '0%': { transform: 'translateY(0) scale(1)', opacity: 1 },
          '50%': { transform: 'translateY(-20px) scale(1.1)', opacity: 0.8 },
          '100%': { transform: 'translateY(-40px) scale(0.9)', opacity: 0 },
        },
        bambiGlow: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(255, 105, 180, 0.3)' },
          '50%': { boxShadow: '0 0 40px rgba(255, 105, 180, 0.6)' },
        },
        bambiBounce: {
          '0%': { transform: 'scale(0.8)', opacity: 0 },
          '50%': { transform: 'scale(1.1)' },
          '100%': { transform: 'scale(1)', opacity: 1 },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        pingOnce: {
          '0%': { transform: 'scale(0.5)', opacity: '0' },
          '50%': { transform: 'scale(1.2)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
