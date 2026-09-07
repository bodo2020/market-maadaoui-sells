from pathlib import Path

path = Path('src/pages/POSPro.tsx')
s = path.read_text(encoding='utf-8')

def replace_once(old: str, new: str, label: str):
    global s
    count = s.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, found {count}')
    s = s.replace(old, new, 1)

replace_once(
    '  const [products, setProducts] = useState<Product[]>([]);\n',
    '  const [products, setProducts] = useState<Product[]>([]);\n  const [remoteSearchResults, setRemoteSearchResults] = useState<Product[] | null>(null);\n',
    'search state',
)

marker = '  const visibleProducts = useMemo(() => {\n'
if s.count(marker) != 1:
    raise SystemExit(f'visible products marker: expected 1 match, found {s.count(marker)}')
search_effect = '''  useEffect(() => {
    const query = search.trim();
    if (!query) {
      setRemoteSearchResults(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void fetchPOSProducts(query)
        .then(rows => { if (!cancelled) setRemoteSearchResults(rows); })
        .catch(() => { if (!cancelled) setRemoteSearchResults([]); });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [search, currentBranchId]);

'''
s = s.replace(marker, search_effect + marker, 1)

old_visible = '''  const visibleProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = query
      ? products.filter(product => product.name.toLowerCase().includes(query) || product.barcode?.includes(query) || product.bulk_barcode?.includes(query))
      : products;
    return [...list].sort((a, b) => {
      const aFav = favorites.includes(a.id) ? 1 : 0;
      const bFav = favorites.includes(b.id) ? 1 : 0;
      if (aFav !== bFav) return bFav - aFav;
      const aStock = stockOf(a) > 0 ? 1 : 0;
      const bStock = stockOf(b) > 0 ? 1 : 0;
      if (aStock !== bStock) return bStock - aStock;
      return a.name.localeCompare(b.name, "ar");
    }).slice(0, query ? 100 : 50);
  }, [products, search, favorites]);
'''
new_visible = '''  const visibleProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    const localMatches = query
      ? products.filter(product => product.name.toLowerCase().includes(query) || product.barcode?.includes(query) || product.bulk_barcode?.includes(query))
      : products;
    const list = query ? (remoteSearchResults ?? localMatches) : products;
    return [...list].sort((a, b) => {
      const aFav = favorites.includes(a.id) ? 1 : 0;
      const bFav = favorites.includes(b.id) ? 1 : 0;
      if (aFav !== bFav) return bFav - aFav;
      const aStock = stockOf(a) > 0 ? 1 : 0;
      const bStock = stockOf(b) > 0 ? 1 : 0;
      if (aStock !== bStock) return bStock - aStock;
      return a.name.localeCompare(b.name, "ar");
    }).slice(0, query ? 100 : 50);
  }, [products, search, favorites, remoteSearchResults]);
'''
replace_once(old_visible, new_visible, 'visible products')

path.write_text(s, encoding='utf-8')
print('POS server search patch applied')
