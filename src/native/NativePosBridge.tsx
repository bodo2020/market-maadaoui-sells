import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { App as CapacitorApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { isPosNative } from './posNative';
import './pos-safe-area.css';

export default function NativePosBridge() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isPosNative()) return;
    document.body.classList.add('pos-native');
    void StatusBar.setOverlaysWebView({ overlay: false });
    void StatusBar.setStyle({ style: Style.Light });
    void StatusBar.setBackgroundColor({ color: '#005931' });

    let active = true;
    let removeListener: (() => Promise<void>) | undefined;
    void CapacitorApp.addListener('backButton', () => {
      // Close an open invoice, checkout, or scanner dialog before changing pages.
      if (document.querySelector('[role="dialog"][data-state="open"]')) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return;
      }
      const path = window.location.pathname;
      if (path === '/' || path === '/login') {
        let hint = document.getElementById('pos-native-back-hint');
        if (!hint) {
          hint = document.createElement('div');
          hint.id = 'pos-native-back-hint';
          hint.textContent = 'أنت داخل تطبيق الكاشير';
          document.body.appendChild(hint);
        }
        hint.classList.add('visible');
        window.setTimeout(() => hint?.classList.remove('visible'), 1600);
        return;
      }
      if (Number(window.history.state?.idx || 0) > 0) navigate(-1);
      else navigate('/');
    }).then(handle => {
      if (active) removeListener = () => handle.remove();
      else void handle.remove();
    });
    return () => {
      active = false;
      document.body.classList.remove('pos-native');
      void removeListener?.();
    };
  }, [navigate]);

  return null;
}
