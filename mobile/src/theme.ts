// Light palette from the reviewed 1A entry/vocabulary references.
export const theme = {
  colors: {
    background: '#FAF7EF', surface: '#FFFDF9', ink: '#173F3B',
    muted: '#547166', primary: '#22675D', onPrimary: '#FFFFFF',
    soft: '#E8EFE5', border: '#DBE5DA', danger: '#A3352B',
  },
  space: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  radius: { button: 20, card: 28 },
  type: { small: 14, body: 18, title: 32, expression: 58, meaning: 27 },
  touchTarget: 48,
} as const;
