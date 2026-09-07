import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertTriangle,
  Banknote,
  Barcode,
  Box,
  Check,
  CreditCard,
  Minus,
  PackageCheck,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Scale,
  ScanLine,
  Search,
  ShoppingCart,
  Trash2,
  User,
  WalletCards,
} from "lucide-react";
import type { CartItem, Customer, POSTab, Product, Sale } from "@/types";
import { siteConfig } from "@/config/site";
import { useAuth } from "@/contexts/AuthContext";
import { useBranchStore } from "@/stores/branchStore";
import { useToast } from "@/hooks/use-toast";
import POSTabs from "@/components/POS/POSTabs";
import BarcodeScanner from "@/components/POS/BarcodeScanner";
import InvoiceDialog from "@/components/POS/InvoiceDialog";
import { fetchPOSProductByBarcode, fetchPOSProducts } from "@/services/supabase/posCatalogService";
import { getLocalPosDevice } from "@/services/supabase/posDeviceService";
import { getPosCashSummary, type PosCashSummary } from "@/services/supabase/posCashService";
import { fetchCustomers, findOrCreateCustomer } from "@/services/supabase/customerService";
import { addFavoriteProduct, getFavoriteProducts, removeFavoriteProduct } from "@/services/supabase/favoritesService";
import { generateInvoiceNumber } from "@/services/supabase/saleService";
import { clearConfirmedPosSale, submitPosSale } from "@/services/supabase/posCheckoutService";

const DEFAULT_TAB_ID = "tab-default";

function money(value: number) {
  return `${Number(value || 0).toFixed(2)} ${siteConfig.currency}`;
}

function stockOf(product: Product) {
  return Number(product.quantity || 0);
}

function initialTabs(): POSTab[] {
  try {
    const saved = localStorage.getItem("pos_tabs");
    if (saved) {
      const parsed = JSON.parse(saved) as POSTab[];
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch {
    // Ignore invalid legacy tab state.
  }
  return [{
    id: DEFAULT_TAB_ID,
    tabName: "عميل 1",
    cartItems: [],
    selectedCustomer: "",
    customerName: "",
    customerPhone: "",
    search: "",
    searchResults: [],
    createdAt: new Date(),
  }];
}

function initialActiveTab() {
  return localStorage.getItem("pos_active_tab") || initialTabs()[0]?.id || DEFAULT_TAB_ID;
}

export default function POSModern() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { currentBranchId, currentBranchName } = useBranchStore();
  const [tabs, setTabs] = useState<POSTab[]>(initialTabs);
  const [activeTabId, setActiveTabId] = useState(initialActiveTab);
  const activeTabIdRef = useRef(activeTabId);
  const searchRef = useRef<HTMLInputElement>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [cashSummary, setCashSummary] = useState<PosCashSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

  const [weightProduct, setWeightProduct] = useState<Product | null>(null);
  const [weightValue, setWeightValue] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "mixed">("cash");
  const [cashTendered, setCashTendered] = useState("");
  const [mixedCash, setMixedCash] = useState("");
  const [mixedCard, setMixedCard] = useState("");
  const [processing, setProcessing] = useState(false);
  const [saleDone, setSaleDone] = useState(false);
  const [currentSale, setCurrentSale] = useState<Sale | null>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const device = useMemo(
    () => currentBranchId ? getLocalPosDevice(currentBranchId) : null,
    [currentBranchId],
  );

  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  useEffect(() => {
    try {
      localStorage.setItem("pos_tabs", JSON.stringify(tabs));
      localStorage.setItem("pos_active_tab", activeTabId);
    } catch {
      // Cart remains usable in memory.
    }
  }, [tabs, activeTabId]);

  const activeTab = useMemo(
    () => tabs.find(tab => tab.id === activeTabId) || tabs[0],
    [tabs, activeTabId],
  );
  const cartItems = activeTab?.cartItems || [];
  const search = activeTab?.search || "";
  const selectedCustomer = activeTab?.selectedCustomer || "";
  const customerName = activeTab?.customerName || "";
  const customerPhone = activeTab?.customerPhone || "";

  const updateActiveTab = useCallback((updates: Partial<POSTab>) => {
    setTabs(prev => prev.map(tab => tab.id === activeTabIdRef.current ? { ...tab, ...updates } : tab));
  }, []);

  const setCartItems = (items: CartItem[]) => updateActiveTab({ cartItems: items });
  const setSearch = (value: string) => updateActiveTab({ search: value });
  const setSelectedCustomer = (value: string) => updateActiveTab({ selectedCustomer: value });
  const setCustomerName = (value: string) => updateActiveTab({ customerName: value });
  const setCustomerPhone = (value: string) => updateActiveTab({ customerPhone: value });

  const refreshCash = useCallback(async () => {
    if (!device) {
      setCashSummary(null);
      return;
    }
    try {
      setCashSummary(await getPosCashSummary(device));
    } catch {
      setCashSummary(null);
    }
  }, [device?.device_id, device?.device_token]);

  const loadWorkspace = useCallback(async (quiet = false) => {
    if (!currentBranchId) return;
    quiet ? setRefreshing(true) : setLoading(true);
    try {
      const [catalog, customerRows, favoriteRows] = await Promise.all([
        fetchPOSProducts(),
        fetchCustomers(),
        user?.id ? getFavoriteProducts(user.id) : Promise.resolve([]),
      ]);
      setProducts(catalog);
      setCustomers(customerRows);
      setFavorites(favoriteRows);
      await refreshCash();
    } catch (error: any) {
      toast({
        title: "تعذر تحديث نقطة البيع",
        description: error?.message || "راجع الاتصال والفرع الحالي.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentBranchId, user?.id, refreshCash, toast]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    if (!device) return;
    const timer = window.setInterval(() => void refreshCash(), 3000);
    return () => window.clearInterval(timer);
  }, [device?.device_id, refreshCash]);

  const cartUsageForProduct = useCallback((productId: string) => {
    return cartItems.reduce((sum, item) => {
      if (item.product.id !== productId) return sum;
      if (item.weight != null) return sum + Number(item.weight || 0);
      return sum + Number(item.quantity || 0);
    }, 0);
  }, [cartItems]);

  const insufficientToast = (product: Product, requested: number) => {
    toast({
      title: "المخزون غير كافٍ",
      description: `${product.name} — المتاح ${stockOf(product)}، والمطلوب بعد الإضافة ${requested}.`,
      variant: "destructive",
    });
  };

  const addNormal = (product: Product) => {
    const available = stockOf(product);
    const used = cartUsageForProduct(product.id);
    if (available <= 0 || used + 1 > available) {
      insufficientToast(product, used + 1);
      return;
    }
    const current = cartItems.find(item => item.product.id === product.id && !item.isBulk && item.weight == null);
    const price = product.is_offer && product.offer_price ? Number(product.offer_price) : Number(product.price);
    const discount = product.is_offer && product.offer_price ? Number(product.price) - Number(product.offer_price) : 0;
    if (current) {
      setCartItems(cartItems.map(item => item === current ? {
        ...item,
        product,
        quantity: item.quantity + 1,
        total: (item.quantity + 1) * price,
      } : item));
    } else {
      setCartItems([...cartItems, { product, quantity: 1, price, discount, total: price, weight: null }]);
    }
    setSearch("");
  };

  const addBulk = (product: Product) => {
    const pack = Number(product.bulk_quantity || 0);
    const packPrice = Number(product.bulk_price || 0);
    const available = stockOf(product);
    const used = cartUsageForProduct(product.id);
    if (!product.bulk_enabled || pack <= 0 || packPrice <= 0) {
      toast({ title: "بيانات الجملة غير مكتملة", variant: "destructive" });
      return;
    }
    if (available <= 0 || used + pack > available) {
      insufficientToast(product, used + pack);
      return;
    }
    const current = cartItems.find(item => item.product.id === product.id && item.isBulk);
    if (current) {
      const quantity = current.quantity + pack;
      setCartItems(cartItems.map(item => item === current ? {
        ...item,
        product,
        quantity,
        price: packPrice / pack,
        total: (quantity / pack) * packPrice,
      } : item));
    } else {
      setCartItems([...cartItems, {
        product,
        quantity: pack,
        price: packPrice / pack,
        discount: 0,
        total: packPrice,
        isBulk: true,
        weight: null,
      }]);
    }
    setSearch("");
  };

  const addWeight = () => {
    if (!weightProduct) return;
    const weight = Number(weightValue);
    if (!Number.isFinite(weight) || weight <= 0) {
      toast({ title: "اكتب وزن صحيح", variant: "destructive" });
      return;
    }
    const used = cartUsageForProduct(weightProduct.id);
    if (stockOf(weightProduct) <= 0 || used + weight > stockOf(weightProduct)) {
      insufficientToast(weightProduct, Number((used + weight).toFixed(3)));
      return;
    }
    const unitPrice = weightProduct.is_offer && weightProduct.offer_price
      ? Number(weightProduct.offer_price)
      : Number(weightProduct.price);
    const normalPrice = Number(weightProduct.price);
    setCartItems([...cartItems, {
      product: weightProduct,
      quantity: 1,
      weight,
      price: unitPrice * weight,
      discount: Math.max(0, normalPrice - unitPrice) * weight,
      total: unitPrice * weight,
    }]);
    setWeightProduct(null);
    setWeightValue("");
    setSearch("");
  };

  const chooseProduct = (product: Product) => {
    if (stockOf(product) <= 0) {
      insufficientToast(product, 1);
      return;
    }
    if (product.barcode_type === "scale" || product.is_weight_based) {
      setWeightProduct(product);
      setWeightValue("");
      return;
    }
    addNormal(product);
  };

  const processBarcode = useCallback(async (raw: string) => {
    const barcode = raw.trim();
    if (!barcode) return;
    try {
      const result = await fetchPOSProductByBarcode(barcode);
      if (!result.product) {
        toast({ title: "الباركود غير موجود في الفرع", description: barcode, variant: "destructive" });
        return;
      }
      if (result.isBulkBarcode) addBulk(result.product);
      else if (result.product.calculated_weight) {
        const product = result.product;
        const weight = Number(product.calculated_weight);
        const used = cartUsageForProduct(product.id);
        if (used + weight > stockOf(product)) insufficientToast(product, used + weight);
        else {
          const price = Number(product.is_offer && product.offer_price ? product.offer_price : product.price);
          setCartItems([...cartItems, {
            product,
            quantity: 1,
            weight,
            price: price * weight,
            discount: 0,
            total: price * weight,
          }]);
        }
      } else chooseProduct(result.product);
      requestAnimationFrame(() => searchRef.current?.focus());
    } catch (error: any) {
      toast({ title: "تعذر قراءة الباركود", description: error?.message || barcode, variant: "destructive" });
    }
  }, [cartItems, cartUsageForProduct, toast]);

  useEffect(() => {
    if (checkoutOpen || weightProduct || scannerOpen) return;
    let buffer = "";
    let lastKeyAt = 0;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const typing = target.tagName === "INPUT" || target.tagName === "TEXTAREA";
      if (typing && target !== searchRef.current) return;
      if (event.key === "Enter") {
        const value = (buffer || search).trim();
        buffer = "";
        if (value) {
          event.preventDefault();
          void processBarcode(value);
        }
        return;
      }
      if (/^[0-9]$/.test(event.key)) {
        const now = Date.now();
        if (now - lastKeyAt > 100) buffer = "";
        buffer += event.key;
        lastKeyAt = now;
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [checkoutOpen, weightProduct, scannerOpen, processBarcode, search]);

  const visibleProducts = useMemo(() => {
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
    }).slice(0, query ? 80 : 40);
  }, [products, search, favorites]);

  const subtotal = useMemo(() => cartItems.reduce((sum, item) => sum + Number(item.total || 0), 0), [cartItems]);
  const discount = useMemo(() => cartItems.reduce((sum, item) => sum + Number(item.discount || 0) * (item.weight || item.quantity || 1), 0), [cartItems]);
  const total = subtotal;
  const unitsCount = useMemo(() => cartItems.reduce((sum, item) => sum + (item.weight ? 1 : item.quantity), 0), [cartItems]);

  const change = paymentMethod === "cash" ? Math.max(0, Number(cashTendered || 0) - total) : 0;
  const paymentValid = useMemo(() => {
    if (paymentMethod === "cash") return Number(cashTendered || 0) >= total;
    if (paymentMethod === "card") return total > 0;
    return Math.abs(Number(mixedCash || 0) + Number(mixedCard || 0) - total) < 0.01;
  }, [paymentMethod, cashTendered, mixedCash, mixedCard, total]);

  const openCheckout = () => {
    if (!cartItems.length) return;
    setCheckoutError(null);
    setSaleDone(false);
    setPaymentMethod("cash");
    setCashTendered(total.toFixed(2));
    setMixedCash("");
    setMixedCard("");
    if (selectedCustomer && selectedCustomer !== "none") {
      const customer = customers.find(row => row.id === selectedCustomer);
      if (customer) {
        setCustomerName(customer.name);
        setCustomerPhone(customer.phone || "");
      }
    }
    setCheckoutOpen(true);
  };

  const validateCartAgainstFreshCatalog = async () => {
    const fresh = await fetchPOSProducts();
    const byId = new Map(fresh.map(product => [product.id, product]));
    for (const item of cartItems) {
      const product = byId.get(item.product.id);
      if (!product) throw new Error(`${item.product.name}: المنتج غير متاح في الفرع.`);
      const requested = cartUsageForProduct(item.product.id);
      if (requested > stockOf(product)) {
        throw new Error(`${product.name}: المتاح الآن ${stockOf(product)} فقط. حدّث السلة.`);
      }
    }
    setProducts(fresh);
    return byId;
  };

  const completeSale = async () => {
    if (processing || !paymentValid || !user?.id || !currentBranchId) return;
    setProcessing(true);
    setCheckoutError(null);
    try {
      await validateCartAgainstFreshCatalog();
      let customer = null;
      if (customerName || customerPhone) customer = await findOrCreateCustomer({ name: customerName, phone: customerPhone || undefined });
      const invoiceNumber = await generateInvoiceNumber();
      const cashApplied = paymentMethod === "cash" ? total : paymentMethod === "mixed" ? Number(mixedCash || 0) : 0;
      const cardApplied = paymentMethod === "card" ? total : paymentMethod === "mixed" ? Number(mixedCard || 0) : 0;
      const profit = cartItems.reduce((sum, item) => {
        const qty = item.weight ?? item.quantity;
        return sum + Number(item.total || 0) - Number(item.product.purchase_price || 0) * Number(qty || 0);
      }, 0);
      const payload: Omit<Sale, "id" | "created_at" | "updated_at"> = {
        date: new Date().toISOString(),
        items: cartItems,
        subtotal: total + discount,
        discount,
        total,
        profit,
        payment_method: paymentMethod,
        cash_amount: cashApplied,
        card_amount: cardApplied,
        customer_name: customer?.name || customerName || undefined,
        customer_phone: customer?.phone || customerPhone || undefined,
        invoice_number: invoiceNumber,
        cashier_name: user.name,
        branch_id: currentBranchId,
      };
      const sale = await submitPosSale(payload, activeTabId);
      setCurrentSale(sale);
      setSaleDone(true);
      toast({ title: "تم البيع بنجاح", description: `فاتورة ${sale.invoice_number}` });
      await Promise.all([loadWorkspace(true), refreshCash()]);
    } catch (error: any) {
      setCheckoutError(error?.message || "تعذر إتمام البيع");
      toast({ title: "تعذر إتمام البيع", description: error?.message || "راجع السلة وحاول مرة أخرى.", variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  const newSale = () => {
    if (user?.id && currentBranchId) clearConfirmedPosSale(user.id, currentBranchId, activeTabId);
    setCartItems([]);
    setSearch("");
    setSelectedCustomer("");
    setCustomerName("");
    setCustomerPhone("");
    setCurrentSale(null);
    setSaleDone(false);
    setCheckoutOpen(false);
    setPaymentMethod("cash");
    setCashTendered("");
    setMixedCash("");
    setMixedCard("");
    requestAnimationFrame(() => searchRef.current?.focus());
  };

  const changeQuantity = (index: number, delta: number) => {
    const item = cartItems[index];
    if (!item || item.isBulk || item.weight != null) return;
    const next = Math.max(1, item.quantity + delta);
    const otherUsage = cartUsageForProduct(item.product.id) - item.quantity;
    if (otherUsage + next > stockOf(item.product)) {
      insufficientToast(item.product, otherUsage + next);
      return;
    }
    setCartItems(cartItems.map((row, rowIndex) => rowIndex === index ? { ...row, quantity: next, total: next * row.price } : row));
  };

  const createTab = () => {
    const tab: POSTab = {
      id: `tab-${Date.now()}`,
      tabName: `عميل ${tabs.length + 1}`,
      cartItems: [],
      selectedCustomer: "",
      customerName: "",
      customerPhone: "",
      search: "",
      searchResults: [],
      createdAt: new Date(),
    };
    setTabs(prev => [...prev, tab]);
    setActiveTabId(tab.id);
  };

  const closeTab = (id: string) => {
    if (tabs.length <= 1) return;
    const tab = tabs.find(row => row.id === id);
    if (tab?.cartItems.length && !window.confirm("السلة دي فيها منتجات. إغلاقها؟")) return;
    const next = tabs.filter(row => row.id !== id);
    setTabs(next);
    if (activeTabId === id) setActiveTabId(next[0].id);
  };

  const toggleFavorite = async (productId: string) => {
    if (!user?.id) return;
    const pinned = favorites.includes(productId);
    const success = pinned
      ? await removeFavoriteProduct(user.id, productId)
      : await addFavoriteProduct(user.id, productId);
    if (success) setFavorites(prev => pinned ? prev.filter(id => id !== productId) : [...prev, productId]);
  };

  const cartPanel = (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">السلة</h2>
          <p className="text-xs text-muted-foreground">{cartItems.length} صنف · {unitsCount} وحدة/وزن</p>
        </div>
        <div className="rounded-xl bg-emerald-50 px-3 py-2 text-left">
          <div className="text-[11px] text-emerald-800/70">درج الكاشير</div>
          <div className="font-bold text-[#005931]">{cashSummary ? money(cashSummary.drawer_balance) : "—"}</div>
        </div>
      </div>

      {cartItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed py-12 text-center text-muted-foreground">
          <ShoppingCart className="mx-auto mb-3 h-9 w-9 opacity-30" />
          <p className="font-medium">السلة فاضية</p>
          <p className="mt-1 text-xs">امسح باركود أو اختر منتج</p>
        </div>
      ) : (
        <div className="max-h-[46vh] space-y-2 overflow-y-auto pr-1">
          {cartItems.map((item, index) => (
            <div key={`${item.product.id}-${index}`} className="rounded-2xl border bg-white p-3 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{item.product.name}</div>
                  <div className="mt-1 flex flex-wrap gap-1 text-xs text-muted-foreground">
                    {item.isBulk && <Badge variant="secondary">جملة · {item.quantity} وحدة</Badge>}
                    {item.weight != null && <Badge variant="secondary">{item.weight} كجم</Badge>}
                    {!item.isBulk && item.weight == null && <span>{money(item.price)} / وحدة</span>}
                  </div>
                </div>
                <div className="text-left">
                  <div className="font-bold">{money(item.total)}</div>
                  <button className="mt-2 text-red-500" onClick={() => setCartItems(cartItems.filter((_, i) => i !== index))}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {!item.isBulk && item.weight == null && (
                <div className="mt-3 flex items-center gap-2">
                  <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => changeQuantity(index, -1)}><Minus className="h-4 w-4" /></Button>
                  <div className="min-w-10 text-center font-bold">{item.quantity}</div>
                  <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => changeQuantity(index, 1)}><Plus className="h-4 w-4" /></Button>
                  <span className="mr-auto text-xs text-muted-foreground">متاح {stockOf(item.product)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="rounded-2xl bg-slate-50 p-4">
        <div className="flex items-center justify-between text-sm text-muted-foreground"><span>المجموع</span><span>{money(subtotal)}</span></div>
        {discount > 0 && <div className="mt-1 flex items-center justify-between text-sm text-emerald-700"><span>الخصم</span><span>- {money(discount)}</span></div>}
        <div className="mt-3 flex items-center justify-between border-t pt-3 text-xl font-black"><span>الإجمالي</span><span>{money(total)}</span></div>
      </div>

      <div className="space-y-2">
        <Label>العميل — اختياري</Label>
        <Select value={selectedCustomer || "none"} onValueChange={setSelectedCustomer}>
          <SelectTrigger className="h-11"><SelectValue placeholder="بدون عميل" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">بدون عميل</SelectItem>
            {customers.map(customer => <SelectItem key={customer.id} value={customer.id}>{customer.name}{customer.phone ? ` · ${customer.phone}` : ""}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Button className="h-13 w-full bg-[#005931] text-base hover:bg-[#004a29]" disabled={!cartItems.length} onClick={openCheckout}>
        <CreditCard className="ml-2 h-5 w-5" /> إتمام الشراء · {money(total)}
      </Button>
    </div>
  );

  return (
    <MainLayout>
      <div dir="rtl" className="mx-auto max-w-[1800px] space-y-4 pb-24 lg:pb-6">
        <div className="sticky top-0 z-30 -mx-3 border-b bg-white/95 px-3 py-3 backdrop-blur md:-mx-6 md:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <div className="ml-auto min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black">نقطة البيع</h1>
                <Badge className="bg-emerald-50 text-[#005931] hover:bg-emerald-50">الوردية مفتوحة</Badge>
              </div>
              <p className="truncate text-xs text-muted-foreground">{user?.name || "الكاشير"} · {currentBranchName || "الفرع الحالي"} · {device?.device_name || "جهاز POS"}</p>
            </div>
            <div className="flex items-center gap-2 rounded-2xl border bg-slate-50 px-3 py-2">
              <WalletCards className="h-4 w-4 text-[#005931]" />
              <div><div className="text-[10px] text-muted-foreground">الرصيد الفعلي للدرج</div><div className="text-sm font-bold">{cashSummary ? money(cashSummary.drawer_balance) : "—"}</div></div>
            </div>
            <Button variant="outline" size="icon" disabled={refreshing} onClick={() => void loadWorkspace(true)}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        <POSTabs tabs={tabs} activeTabId={activeTabId} onCreateTab={createTab} onCloseTab={closeTab} onSwitchTab={setActiveTabId} />

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="min-w-0 space-y-4">
            <Card className="border-0 shadow-sm ring-1 ring-slate-200">
              <CardContent className="p-3 md:p-4">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      ref={searchRef}
                      autoFocus
                      value={search}
                      onChange={event => setSearch(event.target.value)}
                      onKeyDown={event => {
                        if (event.key === "Enter" && search.trim()) void processBarcode(search);
                      }}
                      placeholder="امسح الباركود أو ابحث باسم المنتج"
                      className="h-12 pr-10 text-base"
                    />
                  </div>
                  <Button variant="outline" className="h-12 px-4" onClick={() => setScannerOpen(true)}><ScanLine className="ml-2 h-5 w-5" /><span className="hidden sm:inline">كاميرا</span></Button>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><Barcode className="h-3.5 w-3.5" /> قارئ الباركود جاهز · المنتجات والأسعار من فرع {currentBranchName || "العمل"}</div>
              </CardContent>
            </Card>

            {loading ? (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-48 animate-pulse rounded-2xl bg-slate-100" />)}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {visibleProducts.map(product => {
                  const out = stockOf(product) <= 0;
                  return (
                    <button
                      key={product.id}
                      type="button"
                      disabled={out}
                      onClick={() => chooseProduct(product)}
                      className={`group relative overflow-hidden rounded-2xl border bg-white text-right shadow-sm transition active:scale-[.98] ${out ? "cursor-not-allowed opacity-55" : "hover:-translate-y-0.5 hover:border-[#005931]/40 hover:shadow-md"}`}
                    >
                      <div className="relative aspect-[4/3] bg-slate-50 p-3">
                        <img src={product.image_urls?.[0] || "/placeholder.svg"} alt={product.name} className="h-full w-full object-contain" loading="lazy" />
                        <button type="button" className="absolute left-2 top-2 rounded-full bg-white/95 p-2 shadow" onClick={event => { event.preventDefault(); event.stopPropagation(); void toggleFavorite(product.id); }}>
                          {favorites.includes(product.id) ? <Pin className="h-4 w-4 text-[#005931]" /> : <PinOff className="h-4 w-4 text-slate-500" />}
                        </button>
                        <div className="absolute bottom-2 right-2 flex gap-1">
                          {out ? <Badge variant="destructive">نفد المخزون</Badge> : <Badge className="bg-white/95 text-slate-700 hover:bg-white">متاح {stockOf(product)}</Badge>}
                        </div>
                      </div>
                      <div className="p-3">
                        <div className="line-clamp-2 min-h-10 text-sm font-semibold leading-5">{product.name}</div>
                        <div className="mt-2 flex items-end justify-between gap-2">
                          <div className="font-black text-[#005931]">{money(Number(product.is_offer && product.offer_price ? product.offer_price : product.price))}</div>
                          <div className="flex gap-1">{product.barcode_type === "scale" && <Scale className="h-4 w-4 text-blue-600" />}{product.bulk_enabled && <Box className="h-4 w-4 text-amber-600" />}</div>
                        </div>
                        {product.bulk_enabled && !out && (
                          <Button asChild variant="secondary" className="mt-2 h-9 w-full" onClick={event => { event.preventDefault(); event.stopPropagation(); addBulk(product); }}>
                            <span><Box className="ml-1 h-4 w-4" /> جملة {product.bulk_quantity} · {money(Number(product.bulk_price || 0))}</span>
                          </Button>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <Card className="hidden h-fit border-0 shadow-sm ring-1 ring-slate-200 lg:sticky lg:top-24 lg:block">
            <CardContent className="p-4">{cartPanel}</CardContent>
          </Card>
        </div>
      </div>

      <div className="fixed inset-x-3 bottom-3 z-40 lg:hidden" dir="rtl">
        <Button className="h-14 w-full justify-between rounded-2xl bg-[#005931] px-5 text-base shadow-2xl hover:bg-[#004a29]" onClick={() => setMobileCartOpen(true)}>
          <span className="flex items-center gap-2"><ShoppingCart className="h-5 w-5" /> السلة · {cartItems.length}</span>
          <strong>{money(total)}</strong>
        </Button>
      </div>

      <Sheet open={mobileCartOpen} onOpenChange={setMobileCartOpen}>
        <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-3xl" dir="rtl">
          <SheetHeader><SheetTitle>سلة البيع الحالية</SheetTitle></SheetHeader>
          <div className="mt-4">{cartPanel}</div>
        </SheetContent>
      </Sheet>

      <Dialog open={Boolean(weightProduct)} onOpenChange={open => !open && setWeightProduct(null)}>
        <DialogContent dir="rtl" className="sm:max-w-sm">
          <DialogHeader><DialogTitle>إدخال الوزن</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="rounded-2xl bg-slate-50 p-3"><div className="font-semibold">{weightProduct?.name}</div><div className="mt-1 text-sm text-muted-foreground">المتاح {weightProduct ? stockOf(weightProduct) : 0} كجم</div></div>
            <div className="space-y-2"><Label>الوزن بالكيلو</Label><Input autoFocus inputMode="decimal" value={weightValue} onChange={event => setWeightValue(event.target.value)} onKeyDown={event => event.key === "Enter" && addWeight()} placeholder="0.000" /></div>
            <Button className="w-full bg-[#005931]" onClick={addWeight}><Scale className="ml-2 h-4 w-4" /> إضافة للسلة</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={checkoutOpen} onOpenChange={open => !processing && setCheckoutOpen(open)}>
        <DialogContent dir="rtl" className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>{saleDone ? "تمت عملية البيع" : "إتمام البيع"}</DialogTitle></DialogHeader>
          {saleDone && currentSale ? (
            <div className="space-y-5 py-2">
              <div className="rounded-3xl bg-emerald-50 p-6 text-center text-emerald-900"><div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white"><Check className="h-7 w-7 text-[#005931]" /></div><div className="text-xl font-black">تم تسجيل الفاتورة</div><div className="mt-1 text-sm">{currentSale.invoice_number}</div><div className="mt-3 text-2xl font-black">{money(currentSale.total)}</div></div>
              <Button className="w-full" variant="outline" onClick={() => setInvoiceOpen(true)}><PackageCheck className="ml-2 h-4 w-4" /> عرض وطباعة الفاتورة</Button>
              <Button className="w-full bg-[#005931]" onClick={newSale}>عملية بيع جديدة</Button>
            </div>
          ) : (
            <div className="space-y-5">
              {checkoutError && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{checkoutError}</AlertDescription></Alert>}
              <div className="rounded-2xl bg-slate-50 p-4"><div className="flex items-center justify-between"><span className="text-muted-foreground">إجمالي الفاتورة</span><strong className="text-2xl">{money(total)}</strong></div></div>
              <div className="space-y-3">
                <Label>طريقة الدفع</Label>
                <RadioGroup value={paymentMethod} onValueChange={value => setPaymentMethod(value as typeof paymentMethod)} className="grid grid-cols-3 gap-2">
                  {[{ id: "cash", label: "نقدي", icon: Banknote }, { id: "card", label: "بطاقة", icon: CreditCard }, { id: "mixed", label: "مختلط", icon: WalletCards }].map(option => (
                    <Label key={option.id} htmlFor={`pay-${option.id}`} className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border p-3 ${paymentMethod === option.id ? "border-[#005931] bg-emerald-50 text-[#005931]" : ""}`}>
                      <RadioGroupItem className="sr-only" value={option.id} id={`pay-${option.id}`} /><option.icon className="h-5 w-5" /><span className="text-sm font-semibold">{option.label}</span>
                    </Label>
                  ))}
                </RadioGroup>
              </div>
              {paymentMethod === "cash" && <div className="space-y-2"><Label>المبلغ المستلم من العميل</Label><Input inputMode="decimal" value={cashTendered} onChange={event => setCashTendered(event.target.value)} className="h-12 text-lg" /><div className="text-sm text-muted-foreground">الباقي للعميل: <strong className="text-foreground">{money(change)}</strong></div></div>}
              {paymentMethod === "mixed" && <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label>نقدي</Label><Input inputMode="decimal" value={mixedCash} onChange={event => setMixedCash(event.target.value)} /></div><div className="space-y-2"><Label>بطاقة</Label><Input inputMode="decimal" value={mixedCard} onChange={event => setMixedCard(event.target.value)} /></div><div className="col-span-2 text-xs text-muted-foreground">المجموع: {money(Number(mixedCash || 0) + Number(mixedCard || 0))}</div></div>}
              <div className="space-y-3 border-t pt-4">
                <div className="text-sm font-semibold">بيانات العميل — اختياري</div>
                <div className="grid grid-cols-2 gap-3"><Input value={customerPhone} onChange={event => setCustomerPhone(event.target.value)} placeholder="رقم الهاتف" /><Input value={customerName} onChange={event => setCustomerName(event.target.value)} placeholder="اسم العميل" /></div>
              </div>
              <Button className="h-13 w-full bg-[#005931] text-base hover:bg-[#004a29]" disabled={!paymentValid || processing} onClick={() => void completeSale()}>
                {processing ? <RefreshCw className="ml-2 h-5 w-5 animate-spin" /> : <Check className="ml-2 h-5 w-5" />} {processing ? "جاري تأكيد البيع..." : "تأكيد البيع"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <InvoiceDialog isOpen={invoiceOpen} onClose={() => setInvoiceOpen(false)} sale={currentSale} />
      <BarcodeScanner isOpen={scannerOpen} onClose={() => setScannerOpen(false)} onScan={barcode => { setScannerOpen(false); void processBarcode(barcode); }} />
    </MainLayout>
  );
}
