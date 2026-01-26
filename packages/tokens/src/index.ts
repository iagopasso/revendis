export const tokens = {
  color: {
    bg: '#f7f7f7',
    surface: '#ffffff',
    text: '#1f2933',
    muted: '#52616b',
    primary: '#0f766e',
    primaryDark: '#115e59',
    accent: '#f59e0b',
    danger: '#dc2626',
    success: '#16a34a'
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
