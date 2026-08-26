/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{html,js,ts,jsx,tsx}",
    "./components/**/*.{html,js}",
    "./public/**/*.{html,js}",
  ],
  theme: {
    extend: {
      colors: {
        pine: '#14381F',
        forest: '#285C3A',
        moss: '#587A5B',
        sage: '#A8BFA5',
        'pale-sage': '#DCE6D8',
        latte: '#FFF8E7',
        parchment: '#F7F1E1',
        primary: '#14381F',
        'primary-dark': '#0D2614',
        'on-primary': '#FFF8E7',
        secondary: '#285C3A',
        tertiary: '#587A5B',
        background: '#FFF8E7',
        surface: '#FFF8E7',
        'surface-container': '#F7F1E1',
        'surface-container-low': '#FAF4E3',
        'on-surface': '#1C1C1C',
        'on-surface-variant': 'rgba(28, 28, 28, 0.7)',
        'on-background': '#1C1C1C',
        'outline-variant': 'rgba(20, 56, 31, 0.2)',
        error: '#C0392B',
      },
      fontFamily: {
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        body: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"Space Mono"', 'monospace'],
      },
      borderRadius: {
        pill: '9999px',
      },
      spacing: {
        'margin-desktop': '48px',
        'margin-mobile': '16px',
        'xs': '4px',
        'sm': '8px',
        'md': '16px',
        'lg': '24px',
        'xl': '32px',
        '2xl': '48px',
      }
    },
  },
  plugins: [],
}
