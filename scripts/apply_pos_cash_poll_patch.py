from pathlib import Path

path = Path('src/pages/POSPro.tsx')
s = path.read_text(encoding='utf-8')
old = '''  useEffect(() => {
    if (!device) return;
    const timer = window.setInterval(() => void refreshCash(), 2500);
    return () => window.clearInterval(timer);
  }, [device?.device_id, refreshCash]);
'''
new = '''  useEffect(() => {
    if (!device) return;
    const refreshVisibleCash = () => {
      if (document.visibilityState === "visible") void refreshCash();
    };
    const timer = window.setInterval(refreshVisibleCash, 8000);
    document.addEventListener("visibilitychange", refreshVisibleCash);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshVisibleCash);
    };
  }, [device?.device_id, refreshCash]);
'''
if s.count(old) != 1:
    raise SystemExit(f'cash poll block: expected 1 match, found {s.count(old)}')
s = s.replace(old, new, 1)
path.write_text(s, encoding='utf-8')
print('POS cash polling optimized')
