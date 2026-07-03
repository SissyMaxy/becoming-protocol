/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Velvet — the one design language (2026-07-03 overhaul). Deep warm
        // plum-black boudoir + rose accent + ivory text. Every surface in the
        // app reads from these tokens; bambi mode is the only sanctioned
        // exception (a deliberate altered-state skin, not a second system).
        'protocol': {
          'bg': '#120b10',
          'surface': '#1a1118',
          'surface-light': '#241722',
          'border': '#3b2635',
          'text': '#f2e9e6',
          'text-muted': '#a8929c',
          'text-warm': '#f7efe9',
          'accent': '#c9557f',
          'accent-soft': '#edaec5',
          'success': '#6fbf94',
          'warning': '#e0b36a',
          'danger': '#e06a6a',
        },
        // Bambi Mode colors — warm blush / rose gold
        'bambi': {
          'bg': '#FAF7F5',
          'surface': '#F5ECE8',
          'surface-light': '#FFFFFF',
          'border': '#E8CFC5',
          'text': '#3D2B2B',
          'text-muted': '#7A3E38',
          'accent': '#C4847A',
          'accent-soft': '#D4A89C',
          'success': '#C4847A',
          'warning': '#B06B61',
          'danger': '#96524A',
        },
        'pink': {
          50: '#FAF7F5',
          100: '#F5ECE8',
          200: '#E8CFC5',
          300: '#D4A89C',
          400: '#C4847A',
          500: '#B06B61',
          600: '#96524A',
          700: '#7A3E38',
          800: '#5E2B27',
          900: '#3D2B2B',
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
        'sans': ['Quicksand', 'Nunito', 'Poppins', 'sans-serif'],
        'mono': ['JetBrains Mono', 'Fira Code', 'monospace'],
        'bambi': ['Quicksand', 'Nunito', 'Poppins', 'sans-serif'],
        'handler': ['Inter', 'Quicksand', 'system-ui', 'sans-serif'],
        // Velvet display face — Mommy's voice, wordmarks, hero lines.
        'display': ['"Playfair Display"', 'Georgia', 'serif'],
      },
      boxShadow: {
        'bambi': '0 4px 20px rgba(196, 132, 122, 0.3)',
        'bambi-glow': '0 0 30px rgba(196, 132, 122, 0.4)',
        'bambi-lg': '0 10px 40px rgba(196, 132, 122, 0.35)',
        // Velvet glows — rose, soft, used for the single CTA + her presence.
        'velvet': '0 4px 24px rgba(201, 85, 127, 0.25)',
        'velvet-glow': '0 0 32px rgba(201, 85, 127, 0.35)',
        'velvet-lg': '0 12px 48px rgba(201, 85, 127, 0.3)',
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
          '0%, 100%': { boxShadow: '0 0 20px rgba(196, 132, 122, 0.3)' },
          '50%': { boxShadow: '0 0 40px rgba(196, 132, 122, 0.6)' },
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
