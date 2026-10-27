/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#4a6700',
        'on-primary': '#ffffff',
        'primary-container': '#a8d93e',
        'on-primary-container': '#425c00',
        secondary: '#0051d5',
        'on-secondary': '#ffffff',
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
        'surface-container-lowest': '#ffffff',
        'surface-container-low': '#f3f3f6',
        'surface-container': '#eeeef0',
        'surface-container-high': '#e8e8ea',
        'surface-container-highest': '#e2e2e5',
        outline: '#747964',
        'outline-variant': '#c4c9b1',
        'status-pending': '#f59e0b',
        'status-error': '#ef4444',
      },
      maxWidth: {
        'container-max': '1440px',
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
