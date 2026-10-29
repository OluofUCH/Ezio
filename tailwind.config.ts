import type { Config } from 'tailwindcss'

/**
 * Design tokens transcribed from the Stitch "EduSync CBT Platform" project
 * (the "Lemon" screen set — see docs/stitch/*.html).
 *
 * The token names are kept exactly as Stitch emits them (`surface-container-lowest`,
 * `font-headline-lg` + `text-headline-lg`, …) so markup can be ported from the
 * reference screens without renaming every class. That is also why `fontFamily` has
 * one entry per type role rather than a single `sans`: the Stitch output pairs
 * `font-<role>` with `text-<role>`, and dropping half of the pair would silently
 * change weights and letter-spacing.
 */
const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './src/modules/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#4a6700',
        'on-primary': '#ffffff',
        'primary-container': '#a8d93e',
        'on-primary-container': '#425c00',
        'primary-fixed': '#c1f356',
        'primary-fixed-dim': '#a6d63c',
        'on-primary-fixed': '#141f00',
        'on-primary-fixed-variant': '#374e00',
        'inverse-primary': '#a6d63c',

        secondary: '#0051d5',
        'on-secondary': '#ffffff',
        'secondary-container': '#316bf3',
        'on-secondary-container': '#fefcff',
        'secondary-fixed': '#dbe1ff',
        'secondary-fixed-dim': '#b4c5ff',
        'on-secondary-fixed': '#00174b',
        'on-secondary-fixed-variant': '#003ea8',

        tertiary: '#81488d',
        'on-tertiary': '#ffffff',
        'tertiary-container': '#f5b2ff',
        'on-tertiary-container': '#763e82',
        'tertiary-fixed': '#fdd6ff',
        'tertiary-fixed-dim': '#f2affc',
        'on-tertiary-fixed': '#340042',
        'on-tertiary-fixed-variant': '#673073',

        error: '#ba1a1a',
        'on-error': '#ffffff',
        'error-container': '#ffdad6',
        'on-error-container': '#93000a',

        background: '#f9f9fc',
        'on-background': '#1a1c1e',
        surface: '#ffffff',
        'on-surface': '#1a1c1e',
        'on-surface-variant': '#434936',
        'surface-variant': '#e2e2e5',
        'surface-bright': '#f9f9fc',
        'surface-dim': '#dadadc',
        'surface-container-lowest': '#ffffff',
        'surface-container-low': '#f3f3f6',
        'surface-container': '#eeeef0',
        'surface-container-high': '#e8e8ea',
        'surface-container-highest': '#e2e2e5',
        'surface-tint': '#4a6700',
        'inverse-surface': '#2f3133',
        'inverse-on-surface': '#f0f0f3',

        outline: '#747964',
        'outline-variant': '#c4c9b1',
        'border-subtle': '#e5e7eb',

        // Sync/monitoring semantics — deliberately high-saturation so an offline or
        // flagged state is unmistakable to an invigilator across a hall.
        'status-synced': '#2563eb',
        'status-pending': '#f59e0b',
        'status-error': '#ef4444',

        /**
         * Chart fill. A darker step of the brand lemon, not `primary-container`.
         *
         * #a8d93e scores 1.66:1 against a white chart surface, so a bar painted with it
         * is nearly invisible — the brand colour works as an accent behind text, not as
         * a data mark. #7a9e21 is the lightest step on the same hue that clears 3:1,
         * verified with the dataviz palette validator rather than by eye.
         */
        'chart-bar': '#7a9e21',
        'chart-bar-hover': '#5c7a15',
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        lg: '0.5rem',
        xl: '0.75rem',
        '2xl': '1rem',
        full: '9999px',
      },
      spacing: {
        base: '8px',
        gutter: '24px',
        'margin-mobile': '16px',
        'margin-desktop': '32px',
        'sidebar-width': '260px',
      },
      maxWidth: {
        'container-max': '1440px',
      },
      fontFamily: {
        sans: ['Hanken Grotesk', 'system-ui', 'sans-serif'],
        'display-lg': ['Hanken Grotesk', 'sans-serif'],
        'headline-lg': ['Hanken Grotesk', 'sans-serif'],
        'headline-lg-mobile': ['Hanken Grotesk', 'sans-serif'],
        'headline-md': ['Hanken Grotesk', 'sans-serif'],
        'body-lg': ['Hanken Grotesk', 'sans-serif'],
        'body-md': ['Hanken Grotesk', 'sans-serif'],
        'label-md': ['Hanken Grotesk', 'sans-serif'],
        'label-sm': ['Hanken Grotesk', 'sans-serif'],
      },
      fontSize: {
        'display-lg': ['48px', { lineHeight: '56px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'headline-lg': ['32px', { lineHeight: '40px', letterSpacing: '-0.01em', fontWeight: '600' }],
        'headline-lg-mobile': ['24px', { lineHeight: '32px', fontWeight: '600' }],
        'headline-md': ['24px', { lineHeight: '32px', fontWeight: '600' }],
        'body-lg': ['18px', { lineHeight: '28px', fontWeight: '400' }],
        'body-md': ['16px', { lineHeight: '24px', fontWeight: '400' }],
        'label-md': ['14px', { lineHeight: '20px', letterSpacing: '0.01em', fontWeight: '600' }],
        'label-sm': ['12px', { lineHeight: '16px', letterSpacing: '0.05em', fontWeight: '600' }],
      },
      boxShadow: {
        'level-1': '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
        'level-2': '0 8px 30px rgba(0,0,0,0.06)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 160ms ease-out',
      },
    },
  },
  plugins: [],
}

export default config
