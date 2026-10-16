// Light palette from the reviewed 1A entry/vocabulary references.
export const theme = {
  colors: {
    background: '#FAF7EF', surface: '#FFFDF9', ink: '#173F3B',
    muted: '#547166', primary: '#22675D', onPrimary: '#FFFFFF',
    soft: '#E8EFE5', border: '#DBE5DA', danger: '#A3352B',
    // Error box: danger at 8% fill / 30% border (Figma "מסך כניסה", State=Error).
    dangerSoft: '#A3352B14', dangerBorder: '#A3352B4D',
  },
  space: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  radius: { button: 20, card: 28 },
  type: { small: 14, body: 18, title: 32, expression: 58, meaning: 27 },
  touchTarget: 48,
} as const;

// Retro travel poster + boarding pass look (sign-in and trip map; approved by Dor,
// 2026-10-16, in the Claude Design prototype: artboards SignInAB and MapA).
export const retro = {
  colors: {
    night: '#0D3B40', deep: '#174F52', sea: '#1C6E6B', sunset: '#F26B3A', pink: '#F4A6A0',
    gold: '#F9B233', plum: '#2B1B33', cream: '#FFF3DC', stamp: '#E0563A', inkMuted: '#3E5E5F',
  },
  // Loaded in the root layout from the @expo-google-fonts packages.
  fonts: {
    poster: 'Karantina_700Bold',
    body: 'Rubik_400Regular', medium: 'Rubik_500Medium', bold: 'Rubik_700Bold', heavy: 'Rubik_800ExtraBold',
    mono: 'SpaceMono_700Bold',
  },
} as const;
