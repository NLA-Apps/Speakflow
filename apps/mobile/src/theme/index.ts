import { Platform } from 'react-native';

export const colors = {
  background: '#07101F',
  backgroundDeep: '#040A14',
  surface: '#101D31',
  surfaceRaised: '#162640',
  surfaceElevated: '#13233B',
  primary: '#4C92FF',
  primaryLight: '#8CB8FF',
  primarySoft: '#183A68',
  primaryBorder: '#315A93',
  accent: '#9B84FF',
  accentSoft: '#2B2859',
  text: '#F7F9FF',
  muted: '#8FA3C1',
  subtle: '#647795',
  success: '#35D6A0',
  successBorder: '#247F68',
  warning: '#FFBE43',
  danger: '#FF627B',
  border: '#263B59',
  user: '#1C4C85',
};
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 };
export const radius = { sm: 10, md: 16, lg: 24, pill: 999 };
export const typography = {
  title: { fontSize: 32, lineHeight: 38, fontWeight: '800' as const },
  heading: { fontSize: 22, lineHeight: 29, fontWeight: '800' as const },
  body: { fontSize: 16, lineHeight: 24 },
  caption: { fontSize: 13, lineHeight: 18 },
};
export const shadow = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOpacity: 0.32,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  default: { elevation: 8 },
});
