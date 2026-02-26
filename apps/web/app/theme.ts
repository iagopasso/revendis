export type ThemeMode = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'revendis:web-theme:v1';
export const THEME_ATTRIBUTE = 'data-theme';
export const DEFAULT_THEME_MODE: ThemeMode = 'dark';

const isThemeMode = (value: unknown): value is ThemeMode => value === 'light' || value === 'dark';

export const normalizeThemeMode = (value: unknown): ThemeMode =>
  isThemeMode(value) ? value : DEFAULT_THEME_MODE;

export const readThemePreference = (): ThemeMode => {
  if (typeof window === 'undefined') return DEFAULT_THEME_MODE;
  try {
    return normalizeThemeMode(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME_MODE;
  }
};

export const applyTheme = (theme: ThemeMode) => {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute(THEME_ATTRIBUTE, theme);
};

export const persistThemePreference = (theme: ThemeMode) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage write failures (private mode / blocked storage).
  }
};

export const setThemePreference = (theme: ThemeMode) => {
  applyTheme(theme);
  persistThemePreference(theme);
};

export const THEME_INIT_SCRIPT = `(function(){try{var key='${THEME_STORAGE_KEY}';var theme=localStorage.getItem(key);if(theme!=='light'&&theme!=='dark'){theme='${DEFAULT_THEME_MODE}';}document.documentElement.setAttribute('${THEME_ATTRIBUTE}',theme);}catch(e){document.documentElement.setAttribute('${THEME_ATTRIBUTE}','${DEFAULT_THEME_MODE}');}})();`;
