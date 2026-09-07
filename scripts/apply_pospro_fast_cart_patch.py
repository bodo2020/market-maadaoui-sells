from pathlib import Path
import re

path = Path('src/pages/POSPro.tsx')
s = path.read_text(encoding='utf-8')
original = s

def replace_once(old: str, new: str, label: str):
    global s
    count = s.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, found {count}')
    s = s.replace(old, new, 1)

replace_once(
    'import { generateInvoiceNumber } from "@/services/supabase/saleService";\n',
    '',
    'remove legacy invoice generator import',
)

replace_once(
    '  const [weightValue, setWeightValue] = useState("");\n',
    '  const [weightValue, setWeightValue] = useState("");\n  const [editingWeightIndex, setEditingWeightIndex] = useState<number | null>(null);\n',
    'weight edit state',
)

old_add_weight = '''  const addWeight = () => {
    if (!weightProduct) return;
    const weight = Number(weightValue);
    if (!Number.isFinite(weight) || weight <= 0) {
      toast({ title: "اكتب وزن صحيح", variant: "destructive" });
      return;
    }
    const used = cartUsageForProduct(weightProduct.id);
    if (stockOf(weightProduct) <= 0 || used + weight > stockOf(weightProduct)) {
      insufficientToast(weightProduct, used + weight);
      return;
    }
    const unitPrice = Number(weightProduct.is_offer && weightProduct.offer_price ? weightProduct.offer_price : weightProduct.price);
    const normalPrice = Number(weightProduct.price);
    setCartItems([...cartItems, {
      product: weightProduct,
      quantity: 1,
      weight,
      price: unitPrice * weight,
      discount: Math.max(0, normalPrice - unitPrice),
      total: unitPrice * weight,
    }]);
    setWeightProduct(null);
    setWeightValue("");
    setSearch("");
    requestAnimationFrame(() => searchRef.current?.focus());
  };
'''
new_add_weight = '''  const addWeight = () => {
    if (!weightProduct) return;
    const weight = Number(weightValue);
    if (!Number.isFinite(weight) || weight <= 0 || Number(weight.toFixed(3)) !== weight) {
      toast({ title: "اكتب وزن صحيح", description: "الوزن يقبل حتى 3 أرقام عشرية.", variant: "destructive" });
      return;
    }
    const currentItem = editingWeightIndex == null ? null : cartItems[editingWeightIndex];
    const currentWeight = currentItem?.weight != null ? Number(currentItem.weight) : 0;
    const usedWithoutCurrent = Math.max(0, cartUsageForProduct(weightProduct.id) - currentWeight);
    if (stockOf(weightProduct) <= 0 || usedWithoutCurrent + weight > stockOf(weightProduct)) {
      insufficientToast(weightProduct, usedWithoutCurrent + weight);
      return;
    }
    const unitPrice = Number(weightProduct.is_offer && weightProduct.offer_price ? weightProduct.offer_price : weightProduct.price);
    const normalPrice = Number(weightProduct.price);
    const nextItem: CartItem = {
      product: weightProduct,
      quantity: 1,
      weight,
      price: unitPrice,
      discount: Math.max(0, normalPrice - unitPrice),
      total: Number((unitPrice * weight).toFixed(2)),
    };
    if (editingWeightIndex == null) {
      setCartItems([...cartItems, nextItem]);
    } else {
      setCartItems(cartItems.map((item, index) => index === editingWeightIndex ? nextItem : item));
    }
    setEditingWeightIndex(null);
    setWeightProduct(null);
    setWeightValue("");
    setSearch("");
    requestAnimationFrame(() => searchRef.current?.focus());
  };
'''
replace_once(old_add_weight, new_add_weight, 'replace weight editor')

replace_once(
    '''    if (product.barcode_type === "scale" || product.is_weight_based) {
      setWeightProduct(product);
      setWeightValue("");
      return;
    }
''',
    '''    if (product.barcode_type === "scale" || product.is_weight_based) {
      setEditingWeightIndex(null);
      setWeightProduct(product);
      setWeightValue("");
      return;
    }
''',
    'reset edit mode on new weight item',
)

replace_once(
    '''          setCartItems([...cartItems, {
            product,
            quantity: 1,
            weight,
            price: unitPrice * weight,
            discount: Math.max(0, normalPrice - unitPrice),
            total: unitPrice * weight,
          }]);
''',
    '''          setCartItems([...cartItems, {
            product,
            quantity: 1,
            weight,
            price: unitPrice,
            discount: Math.max(0, normalPrice - unitPrice),
            total: Number((unitPrice * weight).toFixed(2)),
          }]);
''',
    'barcode weight unit price',
)

pattern = re.compile(r'''\n  const validateCartAgainstFreshCatalog = async \(\) => \{.*?\n  \};\n\n  const completeSale''', re.S)
if not pattern.search(s):
    raise SystemExit('remove full-catalog validation: pattern not found')
s = pattern.sub('\n  const completeSale', s, count=1)

replace_once(
    '      await validateCartAgainstFreshCatalog();\n',
    '',
    'remove full catalog validation call',
)

replace_once(
    '      const invoiceNumber = await generateInvoiceNumber();\n',
    '      const invoiceNumber = `PENDING-${Date.now()}`; // Server assigns the final atomic invoice number.\n',
    'remove invoice count roundtrip',
)

insert_after_quantity = '''  const changeQuantity = (index: number, delta: number) => {
    const item = cartItems[index];
    if (!item || item.isBulk || item.weight != null) return;
    const next = item.quantity + delta;
    if (next <= 0) {
      setCartItems(cartItems.filter((_, rowIndex) => rowIndex !== index));
      return;
    }
    const otherUsage = cartUsageForProduct(item.product.id) - item.quantity;
    if (otherUsage + next > stockOf(item.product)) {
      insufficientToast(item.product, otherUsage + next);
      return;
    }
    setCartItems(cartItems.map((row, rowIndex) => rowIndex === index ? { ...row, quantity: next, total: next * row.price } : row));
  };
'''
replacement_quantity = insert_after_quantity + '''
  const changeBulkPacks = (index: number, delta: number) => {
    const item = cartItems[index];
    if (!item?.isBulk) return;
    const pack = Number(item.product.bulk_quantity || 0);
    const packPrice = Number(item.product.bulk_price || 0);
    if (pack <= 0 || packPrice <= 0) {
      toast({ title: "بيانات الجملة غير مكتملة", variant: "destructive" });
      return;
    }
    const currentPacks = Math.max(1, Math.round(Number(item.quantity || 0) / pack));
    const nextPacks = currentPacks + delta;
    if (nextPacks <= 0) {
      setCartItems(cartItems.filter((_, rowIndex) => rowIndex !== index));
      return;
    }
    const nextQuantity = nextPacks * pack;
    const otherUsage = cartUsageForProduct(item.product.id) - Number(item.quantity || 0);
    if (otherUsage + nextQuantity > stockOf(item.product)) {
      insufficientToast(item.product, otherUsage + nextQuantity);
      return;
    }
    setCartItems(cartItems.map((row, rowIndex) => rowIndex === index ? {
      ...row,
      quantity: nextQuantity,
      price: packPrice / pack,
      total: Number((nextPacks * packPrice).toFixed(2)),
    } : row));
  };

  const editWeight = (index: number) => {
    const item = cartItems[index];
    if (!item || item.weight == null) return;
    setEditingWeightIndex(index);
    setWeightProduct(item.product);
    setWeightValue(Number(item.weight).toFixed(3).replace(/0+$/, '').replace(/\.$/, ''));
  };
'''
replace_once(insert_after_quantity, replacement_quantity, 'bulk and weight cart helpers')

old_controls = '''              {!item.isBulk && item.weight == null && (
                <div className="mt-3 flex items-center gap-2">
                  <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => changeQuantity(index, -1)}><Minus className="h-4 w-4" /></Button>
                  <div className="min-w-10 text-center font-bold">{item.quantity}</div>
                  <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => changeQuantity(index, 1)}><Plus className="h-4 w-4" /></Button>
                  <span className="mr-auto text-xs text-muted-foreground">متاح {stockOf(item.product)}</span>
                </div>
              )}
'''
new_controls = '''              {!item.isBulk && item.weight == null && (
                <div className="mt-3 flex items-center gap-2">
                  <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => changeQuantity(index, -1)}><Minus className="h-4 w-4" /></Button>
                  <div className="min-w-10 text-center font-bold">{item.quantity}</div>
                  <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => changeQuantity(index, 1)}><Plus className="h-4 w-4" /></Button>
                  <span className="mr-auto text-xs text-muted-foreground">متاح {stockOf(item.product)}</span>
                </div>
              )}
              {item.isBulk && (
                <div className="mt-3 flex items-center gap-2">
                  <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => changeBulkPacks(index, -1)}><Minus className="h-4 w-4" /></Button>
                  <div className="min-w-20 text-center">
                    <div className="font-bold">{Math.max(1, Math.round(item.quantity / Number(item.product.bulk_quantity || 1)))} عبوة</div>
                    <div className="text-[10px] text-muted-foreground">{item.quantity} وحدة</div>
                  </div>
                  <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => changeBulkPacks(index, 1)}><Plus className="h-4 w-4" /></Button>
                  <span className="mr-auto text-xs text-muted-foreground">العبوة {item.product.bulk_quantity} · متاح {Math.floor(stockOf(item.product) / Number(item.product.bulk_quantity || 1))}</span>
                </div>
              )}
              {item.weight != null && (
                <div className="mt-3 flex items-center gap-2">
                  <Button variant="outline" size="sm" className="h-9" onClick={() => editWeight(index)}><Scale className="ml-1 h-4 w-4" /> تعديل الوزن</Button>
                  <span className="mr-auto text-xs text-muted-foreground">{money(Number(item.price || 0))} / كجم · متاح {stockOf(item.product)} كجم</span>
                </div>
              )}
'''
replace_once(old_controls, new_controls, 'cart controls')

replace_once(
    '<Dialog open={Boolean(weightProduct)} onOpenChange={open => !open && setWeightProduct(null)}>',
    '<Dialog open={Boolean(weightProduct)} onOpenChange={open => { if (!open) { setWeightProduct(null); setEditingWeightIndex(null); } }}>',
    'weight dialog close',
)
replace_once(
    '<DialogHeader><DialogTitle>إدخال الوزن</DialogTitle></DialogHeader>',
    '<DialogHeader><DialogTitle>{editingWeightIndex == null ? "إدخال الوزن" : "تعديل الوزن"}</DialogTitle></DialogHeader>',
    'weight dialog title',
)
replace_once(
    '<Button className="h-12 w-full bg-[#005931]" onClick={addWeight}><Scale className="ml-2 h-4 w-4" /> إضافة للسلة</Button>',
    '<Button className="h-12 w-full bg-[#005931]" onClick={addWeight}><Scale className="ml-2 h-4 w-4" /> {editingWeightIndex == null ? "إضافة للسلة" : "حفظ الوزن"}</Button>',
    'weight dialog action',
)

if s == original:
    raise SystemExit('No changes were made')
path.write_text(s, encoding='utf-8')
print('POSPro patch applied successfully')
