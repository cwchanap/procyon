/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        // Nocturne palette (explicit, for new work)
        ink: {
          900: '#0E0D0B',
          800: '#141210',
          700: '#1C1916',
          600: '#26221D',
        },
        ivory: {
          DEFAULT: '#EDE6D6',
          dim: '#B8AE9C',
        },
        brass: {
          DEFAULT: '#C8A24B',
          bright: '#E3C06B',
        },
        line: {
          DEFAULT: 'rgba(237,230,214,0.08)',
          brass: 'rgba(200,162,75,0.45)',
        },
        // per-variant jewel accents. These tokens are net-new in the Nocturne
        // redesign; light/board/deep/water/den tints consolidate hex values
        // that were previously inlined per-component.
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