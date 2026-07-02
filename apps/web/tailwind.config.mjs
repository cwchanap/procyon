/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        // Nocturne palette — CSS-variable-backed so .light/.dark flip the theme.
        ink: {
          900: 'hsl(var(--ink-900) / <alpha-value>)',
          800: 'hsl(var(--ink-800) / <alpha-value>)',
          700: 'hsl(var(--ink-700) / <alpha-value>)',
          600: 'hsl(var(--ink-600) / <alpha-value>)',
        },
        ivory: {
          DEFAULT: 'hsl(var(--ivory) / <alpha-value>)',
          dim: 'hsl(var(--ivory-dim) / <alpha-value>)',
        },
        brass: {
          DEFAULT: 'hsl(var(--brass) / <alpha-value>)',
          bright: 'hsl(var(--brass-bright) / <alpha-value>)',
        },
        line: {
          // Subtle borders: alpha baked in (no /alpha usage exists in the codebase).
          DEFAULT: 'hsl(var(--line) / 0.08)',
          brass: 'hsl(var(--line-brass) / 0.45)',
        },
        // per-variant accents + board square hexes — constant across themes:
        chess: {
          DEFAULT: '#C8A24B',
          board: '#2A2620', // chess light square
          deep: '#1C1916', // chess dark square
        },
        xiangqi: {
          DEFAULT: '#C8402F',
          light: '#E0654F', // red-player piece tint (Jungle)
          board: '#241513', // xiangqi base square
          river: '#2D1A16', // xiangqi river square
          palace: '#3A211C', // xiangqi palace square
        },
        shogi: {
          DEFAULT: '#3E5C8A',
          light: '#7BA0D6', // blue-player piece tint (Jungle)
          board: '#23283A', // shogi board square
          deep: '#181B26', // shogi promotion-zone square
        },
        jungle: {
          DEFAULT: '#3E8C6F',
          water: '#16323B', // jungle water square
          den: '#1F3029', // jungle den / normal-land square
        },
        // shadcn semantic tokens (values from :root, see Layout.astro)
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['"Hanken Grotesk"', 'system-ui', 'sans-serif'],
        mono: ['"Spline Sans Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        panel: '0 24px 60px -20px rgba(0,0,0,0.7)',
      },
    },
  },
  plugins: [],
};