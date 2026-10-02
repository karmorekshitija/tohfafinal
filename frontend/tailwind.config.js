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
        pine:       '#14381F',
        forest:     '#285C3A',
        moss:       '#587A5B',
        sage:       '#A8BFA5',
        'pale-sage': '#DCE6D8',
        latte:      '#FFF8E7',
        parchment:  '#F7F1E1',

        // ── Core brand ───────────────────────────────────────────────────────
        primary:         '#14381F',
        'primary-dark':  '#0D2614',
        'on-primary':    '#FFF8E7',
        secondary:       '#285C3A',
        tertiary:        '#587A5B',

        // ── Surface scale ────────────────────────────────────────────────────
        background:                  '#FFF8E7',
        surface:                     '#FFF8E7',
        'surface-bright':            '#FFFFFF',
        'surface-container':         '#F7F1E1',
        'surface-container-low':     '#FAF4E3',
        'surface-container-high':    '#EDE7D4',
        'surface-container-highest': '#E5DFC9',

        // ── On-surface ───────────────────────────────────────────────────────
        'on-surface':         '#1C1C1C',
        'on-surface-variant': 'rgba(28, 28, 28, 0.7)',
        'on-background':      '#1C1C1C',

        // ── Primary container scale ──────────────────────────────────────────
        'primary-container':    '#DCE6D8',
        'primary-fixed':        '#C8DBC4',
        'on-primary-container': '#0D2614',

        // ── Secondary container scale ────────────────────────────────────────
        'secondary-container':    '#DCE6D8',
        'on-secondary-container': '#14381F',

        // ── Tertiary container scale ─────────────────────────────────────────
        'tertiary-container':    '#DDD5EE',
        'tertiary-fixed':        '#DDD5EE',
        'on-tertiary-container': '#3B2D5A',

        // ── Error scale ──────────────────────────────────────────────────────
        error:               '#C0392B',
        'error-container':   '#FDECEA',
        'on-error-container':'#7B1D1D',

        // ── Borders ──────────────────────────────────────────────────────────
        outline:         'rgba(20, 56, 31, 0.35)',
        'outline-variant':'rgba(20, 56, 31, 0.2)',
      },

      fontFamily: {
        serif:   ['"Playfair Display"', 'Georgia', 'serif'],
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        sans:    ['"DM Sans"', 'system-ui', 'sans-serif'],
        body:    ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono:    ['"Space Mono"', 'monospace'],
        // Semantic aliases used throughout seller pages
        'headline':    ['"Playfair Display"', 'Georgia', 'serif'],
        'title-serif': ['"Playfair Display"', 'Georgia', 'serif'],
        'data-price':  ['"Space Mono"', 'monospace'],
        'label-caps':  ['"DM Sans"', 'system-ui', 'sans-serif'],
        'body-md':     ['"DM Sans"', 'system-ui', 'sans-serif'],
      },

      fontSize: {
        // Semantic type scale — matches font-* and text-* classes in seller HTML
        'headline-lg': ['1.875rem', { lineHeight: '1.2', fontWeight: '700' }],
        'headline-md': ['1.5rem',   { lineHeight: '1.25', fontWeight: '700' }],
        'headline-sm': ['1.25rem',  { lineHeight: '1.3',  fontWeight: '600' }],
        'body-md':     ['0.9375rem',{ lineHeight: '1.6',  fontWeight: '400' }],
        'body-sm':     ['0.8125rem',{ lineHeight: '1.5',  fontWeight: '400' }],
        'label-caps':  ['0.625rem', { lineHeight: '1.4',  fontWeight: '700' }],
        'data-price':  ['1rem',     { lineHeight: '1.2',  fontWeight: '400' }],
        'title-serif': ['1rem',     { lineHeight: '1.4',  fontWeight: '600' }],
      },

      borderRadius: {
        pill: '9999px',
      },

      spacing: {
        'margin-desktop': '48px',
        'margin-mobile':  '16px',
        'xs':  '4px',
        'sm':  '8px',
        'md':  '16px',
        'lg':  '24px',
        'xl':  '32px',
        '2xl': '48px',
      },
    },
  },
  plugins: [],
}
