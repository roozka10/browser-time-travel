/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#17223c',
        muted: '#6d7892',
        line: '#e6eaf2',
        sky: '#5f7ef5',
        lavender: '#8b5cff',
        mint: '#2dbd78',
      },
      boxShadow: {
        float: '0 24px 60px rgba(26, 47, 95, .12)',
        card: '0 8px 24px rgba(26, 47, 95, .06)',
      },
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
}
