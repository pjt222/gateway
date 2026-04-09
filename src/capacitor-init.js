import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';

export async function initCapacitor() {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#000004' });
  } catch (_) { /* web fallback */ }

  try {
    await SplashScreen.hide();
  } catch (_) { /* web fallback */ }

  App.addListener('appStateChange', ({ isActive }) => {
    window.dispatchEvent(new CustomEvent('capacitor-app-state', { detail: { isActive } }));
  });

  App.addListener('backButton', ({ canGoBack }) => {
    if (!canGoBack) {
      App.exitApp();
    }
  });
}
