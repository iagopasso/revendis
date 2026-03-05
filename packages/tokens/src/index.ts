export const tokens = {
  color: {
    bg: '#f7f0ff',
    surface: '#ffffff',
    text: '#24153f',
    muted: '#6d5b8b',
    primary: '#8860db',
    primaryDark: '#a973eb',
    accent: '#d095f1',
    danger: '#b458de',
    success: '#63d2c7'
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16
  },
  typography: {
    display: {
      fontSize: 28,
      fontWeight: '700'
    },
    title: {
      fontSize: 20,
      fontWeight: '600'
    },
    body: {
      fontSize: 14,
      fontWeight: '400'
    },
    caption: {
      fontSize: 12,
      fontWeight: '400'
    }
  }
} as const;

export type Tokens = typeof tokens;
