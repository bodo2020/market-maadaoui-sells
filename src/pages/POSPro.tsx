import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { clearConfirmedPosSale, submitPosSale } from "@/services/supabase/posCheckoutService";
import { preflightPosCart } from "@/services/supabase/posPreflightService";

const DEFAULT_TAB_ID = "tab-default";

type PaymentMethod = "cash" | "card" | "mixed";

function money(value: number) {
  return `${Number(value || 0).toFixed(2)} ${siteConfig.currency}`;
}

function stockOf(product: Product) {
  return Number(product.quantity || 0);
}

function effectivePriceOf(product: Product) {
  return Number(product.is_offer && product.offer_price != null ? product.offer_price : product.price || 0);
}

function discountPerUnitOf(product: Product, effectivePrice = effectivePriceOf(product)) {
  return Math.max(0, Number(product.price || 0) - effectivePrice);
}

function emptyTab(index = 1): POSTab {
  return {
    id: index === 1 ? DEFAULT_TAB_ID : `tab-${Date.now()}-${index}`,
    tabName: `عميل ${index}`,
    cartItems: [],
    selectedCustomer: "",
    customerName: "",
    customerPhone: "",
    search: "",
    searchResults: [],
    createdAt: new Date(),
  };
}

function initialTabs(): POSTab[] {
  try {
    const saved = localStorage.getItem("pos_tabs");
    if (saved) {
      const parsed = JSON.parse(saved) as POSTab[];
      if (Array.isArray(parsed) && parsed.length) {
        return parsed.map((tab, index) => ({ ...tab, createdAt: tab.createdAt ? new Date(tab.createdAt) : new Date(), tabName: tab.tabName || `عميل ${index + 1}` }));
      }
    }
  } catch {
    // Invalid old browser cache should never block the cashier.
  }
  return [emptyTab()];
}

function initialActiveTab(tabs: POSTab[]) {
  const stored = localStorage.getItem("pos_active_tab");
  return tabs.some(tab => tab.id === stored) ? stored! : tabs[0]?.id || DEFAULT_TAB_ID;
}

function quickCashValues(total: number) {
  if (total <= 0) return [];
  const candidates = [
    total,
    Math.ceil(total / 5) * 5,
    Math.ceil(total / 10) * 10,
    Math.ceil(total / 20) * 20,
    Math.ceil(total / 50) * 50,
    Math.ceil(total / 100) * 100,
    100,
    200,
    500,
    1000,
  ];
  return [...new Set(candidates.map(value => Number(value.toFixed(2))))]
    .filter(value => value >= total)
    .sort((a, b) => a - b)
    .slice(0, 6);
}

export default function POSPro() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { currentBranchId, currentBranchName } = useBranchStore();
  const initial = useMemo(() => initialTabs(), []);
  const [tabs, setTabs] = useState<POSTab[]>(initial);
  const [activeTabId, setActiveTabId] = useState(() => initialActiveTab(initial));
  const activeTabIdRef = useRef(activeTabId);
  const searchRef = useRef<HTMLInputElement>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [remoteSearchResults, setRemoteSearchResults] = useState<Product[] | null>(null);
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
  const [preflighting, setPreflighting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [cashTendered, setCashTendered] = useState("");
  const [mixedCash, setMixedCash] = useState("");
  const [mixedCard, setMixedCard] = useState("");
  const [processing, setProcessing] = useState(false);
  const [saleDone, setSaleDone] = useState(false);
  const [currentSale, setCurrentSale] = useState<Sale | null>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [completedChange, setCompletedChange] = useState(0);
  const [completedPaymentMethod, setCompletedPaymentMethod] = useState<PaymentMethod>("cash");

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
      // Keep selling in memory even if browser storage is unavailable.
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
  const setCustomerName = (value: string) => updateActiveTab({ customerName: value });
  const setCustomerPhone = (value: string) => updateActiveTab({ customerPhone: value });

  const selectCustomer = (value: string) => {
    if (value === "none") {
      updateActiveTab({ selectedCustomer: "", customerName: "", customerPhone: "" });
      return;
    }
    const customer = customers.find(row => row.id === value);
    updateActiveTab({
      selectedCustomer: value,
      customerName: customer?.name || "",
      customerPhone: customer?.phone || "",
      tabName: customer?.name ? customer.name.slice(0, 18) : activeTab?.tabName,
    });
  };

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
      description: `${product.name} — المتاح ${stockOf(product)}، والمطلوب بعد الإضافة ${Number(requested.toFixed(3))}.`,
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
    const index = cartItems.findIndex(item => item.product.id === product.id && !item.isBulk && item.weight == null);
    const price = effectivePriceOf(product);
    const discount = discountPerUnitOf(product, price);
    if (index >= 0) {
      setCartItems(cartItems.map((item, rowIndex) => rowIndex === index ? {
        ...item,
        product,
        quantity: item.quantity + 1,
        price,
        discount,
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
      toast({ title: "بيانات الجملة غير مكتملة", description: "راجع عدد وحدات العبوة وسعر الجملة.", variant: "destructive" });
      return;
    }
    if (available <= 0 || used + pack > available) {
      insufficientToast(product, used + pack);
      return;
    }
    const unitPrice = packPrice / pack;
    const bulkDiscount = Math.max(0, Number(product.price || 0) - unitPrice);
    const index = cartItems.findIndex(item => item.product.id === product.id && item.isBulk);
    if (index >= 0) {
      setCartItems(cartItems.map((item, rowIndex) => {
        if (rowIndex !== index) return item;
        const quantity = item.quantity + pack;
        return { ...item, product, quantity, price: unitPrice, discount: bulkDiscount, total: (quantity / pack) * packPrice };
      }));
    } else {
      setCartItems([...cartItems, {
        product,
        quantity: pack,
        price: unitPrice,
        discount: bulkDiscount,
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
    if (!Number.isFinite(weight) || weight <= 0 || Number(weight.toFixed(3)) !== weight) {
      toast({ title: "اكتب وزن صحيح حتى 3 أرقام عشرية", variant: "destructive" });
      return;
    }
    const used = cartUsageForProduct(weightProduct.id);
    if (stockOf(weightProduct) <= 0 || used + weight > stockOf(weightProduct)) {
      insufficientToast(weightProduct, used + weight);
      return;
    }
    const unitPrice = effectivePriceOf(weightProduct);
    setCartItems([...cartItems, {
      product: weightProduct,
      quantity: 1,
      weight,
      price: unitPrice,
      discount: discountPerUnitOf(weightProduct, unitPrice),
      total: unitPrice * weight,
    }]);
    setWeightProduct(null);
    setWeightValue("");
    setSearch("");
    requestAnimationFrame(() => searchRef.current?.focus());
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
      if (result.isBulkBarcode) {
        addBulk(result.product);
      } else if (result.product.calculated_weight) {
        const product = result.product;
        const weight = Number(product.calculated_weight);
        const used = cartUsageForProduct(product.id);
        if (weight <= 0) throw new Error("الوزن المقروء من الباركود غير صالح.");
        if (used + weight > stockOf(product)) {
          insufficientToast(product, used + weight);
        } else {
          const unitPrice = effectivePriceOf(product);
          setCartItems([...cartItems, {
            product,
            quantity: 1,
            weight,
            price: unitPrice,
            discount: discountPerUnitOf(product, unitPrice),
            total: unitPrice * weight,
          }]);
        }
      } else {
        chooseProduct(result.product);
      }
      setSearch("");
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

  useEffect(() => {
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

  const visibleProducts = useMemo(() => {
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

  const subtotalAfterDiscount = useMemo(() => cartItems.reduce((sum, item) => sum + Number(item.total || 0), 0), [cartItems]);
  const discount = useMemo(() => cartItems.reduce((sum, item) => {
    const multiplier = item.weight != null ? Number(item.weight) : Number(item.quantity || 1);
    return sum + Number(item.discount || 0) * multiplier;
  }, 0), [cartItems]);
  const total = subtotalAfterDiscount;
  const originalSubtotal = total + discount;
  const unitsCount = useMemo(() => cartItems.reduce((sum, item) => sum + (item.weight != null ? 1 : item.quantity), 0), [cartItems]);
  const change = paymentMethod === "cash" ? Math.max(0, Number(cashTendered || 0) - total) : 0;
  const quickCash = useMemo(() => quickCashValues(total), [total]);

  const paymentValid = useMemo(() => {
    if (total <= 0) return false;
    if (paymentMethod === "cash") return Number(cashTendered || 0) >= total;
    if (paymentMethod === "card") return true;
    return Math.abs(Number(mixedCash || 0) + Number(mixedCard || 0) - total) < 0.01;
  }, [paymentMethod, cashTendered, mixedCash, mixedCard, total]);

  const syncProductsFromPreflight = (items: CartItem[]) => {
    const freshById = new Map(items.map(item => [item.product.id, item.product]));
    setProducts(prev => prev.map(product => freshById.has(product.id) ? { ...product, ...freshById.get(product.id)! } : product));
  };

  const openCheckout = useCallback(async () => {
    if (!cartItems.length || processing || preflighting || !currentBranchId) return;
    setPreflighting(true);
    setCheckoutError(null);
    try {
      const checked = await preflightPosCart(currentBranchId, cartItems);
      setCartItems(checked.items);
      syncProductsFromPreflight(checked.items);
      setSaleDone(false);
      setPaymentMethod("cash");
      setCashTendered(checked.total.toFixed(2));
      setMixedCash("");
      setMixedCard("");
      if (selectedCustomer) {
        const customer = customers.find(row => row.id === selectedCustomer);
        if (customer) {
          setCustomerName(customer.name);
          setCustomerPhone(customer.phone || "");
        }
      }
      if (checked.repriced) {
        toast({ title: "تم تحديث السلة", description: "تم تحديث الأسعار والعروض والمخزون قبل فتح الدفع." });
      }
      setCheckoutOpen(true);
    } catch (error: any) {
      toast({ title: "السلة تحتاج مراجعة", description: error?.message || "راجع المنتجات والكميات قبل الدفع.", variant: "destructive" });
    } finally {
      setPreflighting(false);
    }
  }, [cartItems, processing, preflighting, currentBranchId, selectedCustomer, customers, toast]);

  const setMixedCashSmart = (value: string) => {
    setMixedCash(value);
    const amount = Number(value || 0);
    if (Number.isFinite(amount) && amount >= 0 && amount <= total) setMixedCard(Math.max(0, total - amount).toFixed(2));
  };

  const setMixedCardSmart = (value: string) => {
    setMixedCard(value);
    const amount = Number(value || 0);
    if (Number.isFinite(amount) && amount >= 0 && amount <= total) setMixedCash(Math.max(0, total - amount).toFixed(2));
  };

  const applyUpdatedPaymentTotal = (nextTotal: number) => {
    if (paymentMethod === "cash") {
      setCashTendered(nextTotal.toFixed(2));
      return;
    }
    if (paymentMethod === "mixed") {
      const currentCash = Number(mixedCash || 0);
      const safeCash = Number.isFinite(currentCash) && currentCash >= 0 && currentCash <= nextTotal ? currentCash : 0;
      setMixedCash(safeCash.toFixed(2));
      setMixedCard(Math.max(0, nextTotal - safeCash).toFixed(2));
    }
  };

  const completeSale = useCallback(async () => {
    if (processing || !paymentValid || !user?.id || !currentBranchId || !cartItems.length) return;
    setProcessing(true);
    setCheckoutError(null);
    try {
      const checked = await preflightPosCart(currentBranchId, cartItems);
      syncProductsFromPreflight(checked.items);
      if (checked.repriced || Math.abs(Number(checked.total) - Number(total)) > 0.009) {
        setCartItems(checked.items);
        applyUpdatedPaymentTotal(checked.total);
        setCheckoutError("تم تحديث سعر أو عرض في السلة. راجع الإجمالي ثم أكد الدفع مرة أخرى.");
        return;
      }

      let customer = null;
      if (customerName || customerPhone) customer = await findOrCreateCustomer({ name: customerName || "عميل", phone: customerPhone || undefined });
      const cashApplied = paymentMethod === "cash" ? checked.total : paymentMethod === "mixed" ? Number(mixedCash || 0) : 0;
      const cardApplied = paymentMethod === "card" ? checked.total : paymentMethod === "mixed" ? Number(mixedCard || 0) : 0;
      const profit = checked.items.reduce((sum, item) => {
        const qty = item.weight ?? item.quantity;
        return sum + Number(item.total || 0) - Number(item.product.purchase_price || 0) * Number(qty || 0);
      }, 0);
      const payload: Omit<Sale, "id" | "created_at" | "updated_at"> = {
        date: new Date().toISOString(),
        items: checked.items,
        subtotal: checked.subtotal,
        discount: checked.discount,
        total: checked.total,
        profit,
        payment_method: paymentMethod,
        cash_amount: cashApplied,
        card_amount: cardApplied,
        customer_name: customer?.name || customerName || undefined,
        customer_phone: customer?.phone || customerPhone || undefined,
        invoice_number: "PENDING",
        cashier_name: user.name,
        branch_id: currentBranchId,
      };
      const sale = await submitPosSale(payload, activeTabIdRef.current);
      setCompletedChange(paymentMethod === "cash" ? Math.max(0, Number(cashTendered || 0) - checked.total) : 0);
      setCompletedPaymentMethod(paymentMethod);
      setCurrentSale(sale);
      setSaleDone(true);
      toast({ title: "تم البيع بنجاح", description: `فاتورة ${sale.invoice_number}` });
      void loadWorkspace(true);
      void refreshCash();
    } catch (error: any) {
      setCheckoutError(error?.message || "تعذر إتمام البيع");
      toast({ title: "تعذر إتمام البيع", description: error?.message || "راجع السلة وحاول مرة أخرى.", variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  }, [processing, paymentValid, user?.id, user?.name, currentBranchId, cartItems, customerName, customerPhone, paymentMethod, mixedCash, mixedCard, total, cashTendered, loadWorkspace, refreshCash, toast]);

  const newSale = () => {
    if (user?.id && currentBranchId) clearConfirmedPosSale(user.id, currentBranchId, activeTabIdRef.current);
    updateActiveTab({ cartItems: [], search: "", selectedCustomer: "", customerName: "", customerPhone: "", tabName: activeTab?.tabName?.startsWith("عميل") ? activeTab.tabName : "عميل" });
    setCurrentSale(null);
    setSaleDone(false);
    setCheckoutOpen(false);
    setPaymentMethod("cash");
    setCashTendered("");
    setMixedCash("");
    setMixedCard("");
    setCompletedChange(0);
    setMobileCartOpen(false);
    requestAnimationFrame(() => searchRef.current?.focus());
  };

  const setNormalQuantity = (index: number, next: number) => {
    const item = cartItems[index];
    if (!item || item.isBulk || item.weight != null) return false;
    if (!Number.isInteger(next) || next < 1) {
      toast({ title: "الكمية لازم تكون رقم صحيح أكبر من صفر", variant: "destructive" });
      return false;
    }
    const otherUsage = cartUsageForProduct(item.product.id) - Number(item.quantity || 0);
    if (otherUsage + next > stockOf(item.product)) {
      insufficientToast(item.product, otherUsage + next);
      return false;
    }
    setCartItems(cartItems.map((row, rowIndex) => rowIndex === index ? { ...row, quantity: next, total: next * row.price } : row));
    return true;
  };

  const changeQuantity = (index: number, delta: number) => {
    const item = cartItems[index];
    if (!item || item.isBulk || item.weight != null) return;
    const next = item.quantity + delta;
    if (next <= 0) {
      setCartItems(cartItems.filter((_, rowIndex) => rowIndex !== index));
      return;
    }
    setNormalQuantity(index, next);
  };

  const setBulkPackCount = (index: number, packCount: number) => {
    const item = cartItems[index];
    if (!item?.isBulk) return false;
    const pack = Number(item.product.bulk_quantity || 0);
    const packPrice = Number(item.product.bulk_price || 0);
    if (!Number.isInteger(packCount) || packCount < 1 || pack <= 0 || packPrice <= 0) {
      toast({ title: "عدد عبوات الجملة غير صحيح", variant: "destructive" });
      return false;
    }
    const nextQuantity = packCount * pack;
    const otherUsage = cartUsageForProduct(item.product.id) - Number(item.quantity || 0);
    if (otherUsage + nextQuantity > stockOf(item.product)) {
      insufficientToast(item.product, otherUsage + nextQuantity);
      return false;
    }
    const unitPrice = packPrice / pack;
    const perUnitDiscount = Math.max(0, Number(item.product.price || 0) - unitPrice);
    setCartItems(cartItems.map((row, rowIndex) => rowIndex === index ? {
      ...row,
      quantity: nextQuantity,
      price: unitPrice,
      discount: perUnitDiscount,
      total: packCount * packPrice,
    } : row));
    return true;
  };

  const changeBulkPacks = (index: number, delta: number) => {
    const item = cartItems[index];
    if (!item?.isBulk) return;
    const pack = Number(item.product.bulk_quantity || 0);
    const currentPacks = pack > 0 ? Math.max(1, Math.round(Number(item.quantity || 0) / pack)) : 1;
    const next = currentPacks + delta;
    if (next <= 0) {
      setCartItems(cartItems.filter((_, rowIndex) => rowIndex !== index));
      return;
    }
    setBulkPackCount(index, next);
  };

  const setCartWeight = (index: number, nextWeight: number) => {
    const item = cartItems[index];
    if (!item || item.weight == null) return false;
    if (!Number.isFinite(nextWeight) || nextWeight <= 0 || Number(nextWeight.toFixed(3)) !== nextWeight) {
      toast({ title: "الوزن لازم يكون أكبر من صفر وحتى 3 أرقام عشرية", variant: "destructive" });
      return false;
    }
    const otherUsage = cartUsageForProduct(item.product.id) - Number(item.weight || 0);
    if (otherUsage + nextWeight > stockOf(item.product)) {
      insufficientToast(item.product, otherUsage + nextWeight);
      return false;
    }
    const unitPrice = effectivePriceOf(item.product);
    setCartItems(cartItems.map((row, rowIndex) => rowIndex === index ? {
      ...row,
      weight: nextWeight,
      price: unitPrice,
      discount: discountPerUnitOf(item.product, unitPrice),
      total: unitPrice * nextWeight,
    } : row));
    return true;
  };

  const createTab = useCallback(() => {
    const tab = emptyTab(tabs.length + 1);
    setTabs(prev => [...prev, tab]);
    setActiveTabId(tab.id);
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [tabs.length]);

  const holdCurrentCart = () => {
    if (!cartItems.length) {
      createTab();
      return;
    }
    const heldName = activeTab?.tabName || "السلة الحالية";
    createTab();
    setMobileCartOpen(false);
    toast({ title: "تم تعليق السلة", description: `${heldName} محفوظة ويمكن الرجوع لها من شريط السلات.` });
  };

  const closeTab = (id: string) => {
    if (tabs.length <= 1) return;
    const tab = tabs.find(row => row.id === id);
    if (tab?.cartItems.length && !window.confirm("السلة دي فيها منتجات. هل تريد إلغاءها نهائيًا؟")) return;
    const next = tabs.filter(row => row.id !== id);
    setTabs(next);
    if (activeTabId === id) setActiveTabId(next[0].id);
  };

  const clearCurrentCart = () => {
    if (!cartItems.length) return;
    if (!window.confirm("إلغاء كل محتويات السلة الحالية؟")) return;
    setCartItems([]);
    setSearch("");
    requestAnimationFrame(() => searchRef.current?.focus());
  };

  const toggleFavorite = async (productId: string) => {
    if (!user?.id) return;
    const pinned = favorites.includes(productId);
    const success = pinned
      ? await removeFavoriteProduct(user.id, productId)
      : await addFavoriteProduct(user.id, productId);
    if (success) setFavorites(prev => pinned ? prev.filter(id => id !== productId) : [...prev, productId]);
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        createTab();
        return;
      }
      if (event.key === "F2") {
        event.preventDefault();
        if (!checkoutOpen) searchRef.current?.focus();
        return;
      }
      if (event.key === "F4") {
        event.preventDefault();
        if (!checkoutOpen && cartItems.length) void openCheckout();
        return;
      }
      if (checkoutOpen && !saleDone) {
        if (event.key === "F6") { event.preventDefault(); setPaymentMethod("cash"); setCashTendered(total.toFixed(2)); }
        if (event.key === "F7") { event.preventDefault(); setPaymentMethod("card"); }
        if (event.key === "F8") { event.preventDefault(); setPaymentMethod("mixed"); setMixedCash("0.00"); setMixedCard(total.toFixed(2)); }
        if (event.key === "F9") { event.preventDefault(); if (paymentValid && !processing) void completeSale(); }
      }
      if (event.key === "Escape" && !processing) {
        if (scannerOpen) setScannerOpen(false);
        else if (weightProduct) setWeightProduct(null);
        else if (checkoutOpen && !saleDone) setCheckoutOpen(false);
        else setMobileCartOpen(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [createTab, checkoutOpen, saleDone, cartItems.length, openCheckout, total, paymentValid, processing, completeSale, scannerOpen, weightProduct]);

  const cartPanel = (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">السلة الحالية</h2>
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
          {cartItems.map((item, index) => {
            const bulkPackSize = Number(item.product.bulk_quantity || 0);
            const bulkPacks = item.isBulk && bulkPackSize > 0 ? Math.max(1, Math.round(Number(item.quantity || 0) / bulkPackSize)) : 0;
            return (
              <div key={`${item.product.id}-${item.isBulk ? "bulk" : item.weight != null ? `w-${index}` : "unit"}-${index}`} className="rounded-2xl border bg-white p-3 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{item.product.name}</div>
                    <div className="mt-1 flex flex-wrap gap-1 text-xs text-muted-foreground">
                      {item.isBulk && <Badge variant="secondary">جملة · {bulkPacks} عبوة · {item.quantity} وحدة</Badge>}
                      {item.weight != null && <Badge variant="secondary">موزون</Badge>}
                      {!item.isBulk && item.weight == null && <span>{money(item.price)} / وحدة</span>}
                    </div>
                  </div>
                  <div className="text-left">
                    <div className="font-bold">{money(item.total)}</div>
                    <button type="button" aria-label="حذف الصنف" className="mt-2 rounded-lg p-1 text-red-500 hover:bg-red-50" onClick={() => setCartItems(cartItems.filter((_, i) => i !== index))}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {!item.isBulk && item.weight == null && (
                  <div className="mt-3 flex items-center gap-2">
                    <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => changeQuantity(index, -1)}><Minus className="h-4 w-4" /></Button>
                    <Input
                      key={`qty-${index}-${item.quantity}`}
                      type="number"
                      min={1}
                      step={1}
                      inputMode="numeric"
                      defaultValue={item.quantity}
                      className="h-9 w-20 text-center font-bold"
                      onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }}
                      onBlur={event => {
                        const next = Number(event.currentTarget.value);
                        if (!setNormalQuantity(index, next)) event.currentTarget.value = String(item.quantity);
                      }}
                    />
                    <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => changeQuantity(index, 1)}><Plus className="h-4 w-4" /></Button>
                    <span className="mr-auto text-xs text-muted-foreground">متاح {stockOf(item.product)}</span>
                  </div>
                )}

                {item.isBulk && (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => changeBulkPacks(index, -1)}><Minus className="h-4 w-4" /></Button>
                      <Input
                        key={`bulk-${index}-${bulkPacks}`}
                        type="number"
                        min={1}
                        step={1}
                        inputMode="numeric"
                        defaultValue={bulkPacks}
                        className="h-9 w-20 text-center font-bold"
                        onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }}
                        onBlur={event => {
                          const next = Number(event.currentTarget.value);
                          if (!setBulkPackCount(index, next)) event.currentTarget.value = String(bulkPacks);
                        }}
                      />
                      <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => changeBulkPacks(index, 1)}><Plus className="h-4 w-4" /></Button>
                      <span className="text-xs font-medium">عبوة × {bulkPackSize}</span>
                      <span className="mr-auto text-xs text-muted-foreground">متاح {stockOf(item.product)}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">سعر العبوة {money(Number(item.product.bulk_price || 0))} · سعر الوحدة بالجملة {money(item.price)}</div>
                  </div>
                )}

                {item.weight != null && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1">
                      <Input
                        key={`weight-${index}-${Number(item.weight).toFixed(3)}`}
                        type="number"
                        min="0.001"
                        step="0.001"
                        inputMode="decimal"
                        defaultValue={Number(item.weight).toFixed(3)}
                        className="h-9 w-24 text-center font-bold"
                        onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }}
                        onBlur={event => {
                          const next = Number(event.currentTarget.value);
                          if (!setCartWeight(index, next)) event.currentTarget.value = Number(item.weight).toFixed(3);
                        }}
                      />
                      <span className="text-xs">كجم</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{money(item.price)} / كجم</span>
                    <span className="mr-auto text-xs text-muted-foreground">متاح {stockOf(item.product)} كجم</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-2xl bg-slate-50 p-4">
        {discount > 0 && <div className="flex items-center justify-between text-sm text-muted-foreground"><span>قبل الخصم</span><span>{money(originalSubtotal)}</span></div>}
        {discount > 0 && <div className="mt-1 flex items-center justify-between text-sm text-emerald-700"><span>الخصم</span><span>- {money(discount)}</span></div>}
        <div className={`${discount > 0 ? "mt-3 border-t pt-3" : ""} flex items-center justify-between text-xl font-black`}><span>الإجمالي</span><span>{money(total)}</span></div>
      </div>

      <div className="space-y-2">
        <Label>العميل — اختياري</Label>
        <Select value={selectedCustomer || "none"} onValueChange={selectCustomer}>
          <SelectTrigger className="h-11"><SelectValue placeholder="بدون عميل" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">بدون عميل</SelectItem>
            {customers.map(customer => <SelectItem key={customer.id} value={customer.id}>{customer.name}{customer.phone ? ` · ${customer.phone}` : ""}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="h-11" disabled={!cartItems.length} onClick={holdCurrentCart}><ShoppingCart className="ml-2 h-4 w-4" /> تعليق السلة</Button>
        <Button variant="outline" className="h-11 text-red-600 hover:text-red-700" disabled={!cartItems.length} onClick={clearCurrentCart}><Trash2 className="ml-2 h-4 w-4" /> إلغاء السلة</Button>
      </div>

      <Button className="h-14 w-full bg-[#005931] text-base hover:bg-[#004a29]" disabled={!cartItems.length || preflighting} onClick={() => void openCheckout()}>
        {preflighting ? <RefreshCw className="ml-2 h-5 w-5 animate-spin" /> : <CreditCard className="ml-2 h-5 w-5" />}
        {preflighting ? "مراجعة السلة..." : `إتمام الشراء · ${money(total)}`}
      </Button>
    </div>
  );

  return (
    <MainLayout>
      <div dir="rtl" className="mx-auto max-w-[1800px] space-y-4 pb-28 lg:pb-6">
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
              <div><div className="text-[10px] text-muted-foreground">رصيد الدرج الآن</div><div className="text-sm font-bold">{cashSummary ? money(cashSummary.drawer_balance) : "—"}</div></div>
            </div>
            <Button variant="outline" size="icon" aria-label="تحديث نقطة البيع" disabled={refreshing} onClick={() => void loadWorkspace(true)}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        <POSTabs tabs={tabs} activeTabId={activeTabId} onCreateTab={createTab} onCloseTab={closeTab} onSwitchTab={setActiveTabId} />

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_390px] xl:grid-cols-[minmax(0,1fr)_430px]">
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
                      onKeyDown={event => { if (event.key === "Enter" && search.trim()) void processBarcode(search); }}
                      placeholder="امسح الباركود أو ابحث باسم المنتج"
                      className="h-12 pr-10 text-base"
                    />
                  </div>
                  <Button variant="outline" className="h-12 px-4" onClick={() => setScannerOpen(true)}><ScanLine className="ml-2 h-5 w-5" /><span className="hidden sm:inline">كاميرا</span></Button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1"><Barcode className="h-3.5 w-3.5" /> قارئ الباركود جاهز</span>
                  <span className="hidden md:inline">F2 بحث</span><span className="hidden md:inline">F4 دفع</span><span className="hidden md:inline">F6 نقدي</span><span className="hidden md:inline">F7 بطاقة</span><span className="hidden md:inline">F8 مختلط</span><span className="hidden md:inline">F9 تأكيد</span><span className="hidden md:inline">Ctrl+N سلة جديدة</span>
                </div>
              </CardContent>
            </Card>

            {loading ? (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 10 }).map((_, index) => <div key={index} className="h-48 animate-pulse rounded-2xl bg-slate-100" />)}
              </div>
            ) : visibleProducts.length === 0 ? (
              <div className="rounded-3xl border border-dashed bg-white py-16 text-center text-muted-foreground"><Search className="mx-auto mb-3 h-9 w-9 opacity-30" /><div className="font-semibold">مفيش منتجات مطابقة</div><div className="mt-1 text-xs">جرّب اسم أو باركود مختلف</div></div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {visibleProducts.map(product => {
                  const out = stockOf(product) <= 0;
                  return (
                    <div
                      key={product.id}
                      role="button"
                      tabIndex={out ? -1 : 0}
                      aria-disabled={out}
                      onClick={() => !out && chooseProduct(product)}
                      onKeyDown={event => { if (!out && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); chooseProduct(product); } }}
                      className={`group relative overflow-hidden rounded-2xl border bg-white text-right shadow-sm transition ${out ? "cursor-not-allowed opacity-55" : "cursor-pointer hover:-translate-y-0.5 hover:border-[#005931]/40 hover:shadow-md active:scale-[.98]"}`}
                    >
                      <div className="relative aspect-[4/3] bg-slate-50 p-3">
                        <img src={product.image_urls?.[0] || "/placeholder.svg"} alt={product.name} className="h-full w-full object-contain" loading="lazy" />
                        <button type="button" aria-label="تثبيت المنتج" className="absolute left-2 top-2 rounded-full bg-white/95 p-2 shadow" onClick={event => { event.preventDefault(); event.stopPropagation(); void toggleFavorite(product.id); }}>
                          {favorites.includes(product.id) ? <Pin className="h-4 w-4 text-[#005931]" /> : <PinOff className="h-4 w-4 text-slate-500" />}
                        </button>
                        <div className="absolute bottom-2 right-2 flex gap-1">
                          {out ? <Badge variant="destructive">نفد المخزون</Badge> : <Badge className="bg-white/95 text-slate-700 hover:bg-white">متاح {stockOf(product)}</Badge>}
                        </div>
                      </div>
                      <div className="p-3">
                        <div className="line-clamp-2 min-h-10 text-sm font-semibold leading-5">{product.name}</div>
                        <div className="mt-2 flex items-end justify-between gap-2">
                          <div className="font-black text-[#005931]">{money(effectivePriceOf(product))}</div>
                          <div className="flex gap-1">{(product.barcode_type === "scale" || product.is_weight_based) && <Scale className="h-4 w-4 text-blue-600" />}{product.bulk_enabled && <Box className="h-4 w-4 text-amber-600" />}</div>
                        </div>
                        {product.bulk_enabled && !out && (
                          <Button variant="secondary" className="mt-2 h-9 w-full" onClick={event => { event.preventDefault(); event.stopPropagation(); addBulk(product); }}>
                            <Box className="ml-1 h-4 w-4" /> جملة {product.bulk_quantity} · {money(Number(product.bulk_price || 0))}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <Card className="hidden h-fit border-0 shadow-sm ring-1 ring-slate-200 lg:sticky lg:top-24 lg:block"><CardContent className="p-4">{cartPanel}</CardContent></Card>
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
            <div className="space-y-2"><Label>الوزن بالكيلو</Label><Input autoFocus inputMode="decimal" value={weightValue} onChange={event => setWeightValue(event.target.value)} onKeyDown={event => event.key === "Enter" && addWeight()} placeholder="0.000" className="h-12 text-lg" /></div>
            <Button className="h-12 w-full bg-[#005931]" onClick={addWeight}><Scale className="ml-2 h-4 w-4" /> إضافة للسلة</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={checkoutOpen} onOpenChange={open => { if (!processing && !saleDone) setCheckoutOpen(open); }}>
        <DialogContent dir="rtl" className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>{saleDone ? "تمت عملية البيع" : "إتمام البيع"}</DialogTitle></DialogHeader>
          {saleDone && currentSale ? (
            <div className="space-y-5 py-2">
              <div className="rounded-3xl bg-emerald-50 p-6 text-center text-emerald-900">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white"><Check className="h-7 w-7 text-[#005931]" /></div>
                <div className="text-xl font-black">تم تسجيل الفاتورة</div>
                <div className="mt-1 text-sm">{currentSale.invoice_number}</div>
                <div className="mt-3 text-2xl font-black">{money(currentSale.total)}</div>
              </div>
              {completedPaymentMethod === "cash" && completedChange > 0 && (
                <div className="rounded-2xl border-2 border-[#005931]/20 bg-white p-4 text-center"><div className="text-sm text-muted-foreground">الباقي للعميل</div><div className="mt-1 text-3xl font-black text-[#005931]">{money(completedChange)}</div></div>
              )}
              <Button className="h-12 w-full" variant="outline" onClick={() => setInvoiceOpen(true)}><PackageCheck className="ml-2 h-4 w-4" /> عرض وطباعة الفاتورة</Button>
              <Button className="h-12 w-full bg-[#005931]" onClick={newSale}>عملية بيع جديدة</Button>
            </div>
          ) : (
            <div className="space-y-5">
              {checkoutError && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{checkoutError}</AlertDescription></Alert>}
              <div className="rounded-2xl bg-slate-50 p-4"><div className="flex items-center justify-between"><span className="text-muted-foreground">إجمالي الفاتورة</span><strong className="text-2xl">{money(total)}</strong></div></div>
              <div className="space-y-3">
                <div className="flex items-center justify-between"><Label>طريقة الدفع</Label><span className="text-[11px] text-muted-foreground">F6 / F7 / F8</span></div>
                <RadioGroup value={paymentMethod} onValueChange={value => {
                  const method = value as PaymentMethod;
                  setPaymentMethod(method);
                  setCheckoutError(null);
                  if (method === "cash") setCashTendered(total.toFixed(2));
                  if (method === "mixed") { setMixedCash("0.00"); setMixedCard(total.toFixed(2)); }
                }} className="grid grid-cols-3 gap-2">
                  {[{ id: "cash", label: "نقدي", icon: Banknote }, { id: "card", label: "بطاقة", icon: CreditCard }, { id: "mixed", label: "مختلط", icon: WalletCards }].map(option => (
                    <Label key={option.id} htmlFor={`pay-${option.id}`} className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border p-3 ${paymentMethod === option.id ? "border-[#005931] bg-emerald-50 text-[#005931]" : ""}`}>
                      <RadioGroupItem className="sr-only" value={option.id} id={`pay-${option.id}`} /><option.icon className="h-5 w-5" /><span className="text-sm font-semibold">{option.label}</span>
                    </Label>
                  ))}
                </RadioGroup>
              </div>

              {paymentMethod === "cash" && (
                <div className="space-y-3">
                  <div className="space-y-2"><Label>المبلغ المستلم من العميل</Label><Input autoFocus inputMode="decimal" value={cashTendered} onChange={event => setCashTendered(event.target.value)} className="h-12 text-xl font-bold" /></div>
                  <div className="flex flex-wrap gap-2">
                    {quickCash.map(value => <Button key={value} type="button" variant={Math.abs(Number(cashTendered || 0) - value) < 0.001 ? "default" : "outline"} className={Math.abs(Number(cashTendered || 0) - value) < 0.001 ? "bg-[#005931]" : ""} onClick={() => setCashTendered(value.toFixed(2))}>{value === total ? "بالضبط" : money(value)}</Button>)}
                  </div>
                  <div className={`rounded-2xl p-4 text-center ${paymentValid ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}><div className="text-xs">الباقي للعميل</div><div className="mt-1 text-3xl font-black">{money(change)}</div></div>
                </div>
              )}

              {paymentMethod === "mixed" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2"><Label>نقدي</Label><Input autoFocus inputMode="decimal" value={mixedCash} onChange={event => setMixedCashSmart(event.target.value)} className="h-12 text-lg" /></div>
                    <div className="space-y-2"><Label>بطاقة</Label><Input inputMode="decimal" value={mixedCard} onChange={event => setMixedCardSmart(event.target.value)} className="h-12 text-lg" /></div>
                  </div>
                  <div className={`rounded-xl p-3 text-sm ${paymentValid ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>المجموع: <strong>{money(Number(mixedCash || 0) + Number(mixedCard || 0))}</strong> من {money(total)}</div>
                </div>
              )}

              <div className="space-y-3 border-t pt-4">
                <div className="text-sm font-semibold">بيانات العميل — اختياري</div>
                <div className="grid grid-cols-2 gap-3"><Input value={customerPhone} onChange={event => setCustomerPhone(event.target.value)} placeholder="رقم الهاتف" /><Input value={customerName} onChange={event => setCustomerName(event.target.value)} placeholder="اسم العميل" /></div>
              </div>

              <Button className="h-14 w-full bg-[#005931] text-base hover:bg-[#004a29]" disabled={!paymentValid || processing} onClick={() => void completeSale()}>
                {processing ? <RefreshCw className="ml-2 h-5 w-5 animate-spin" /> : <Check className="ml-2 h-5 w-5" />} {processing ? "جاري تسجيل البيع..." : `تأكيد البيع · ${money(total)}`}
              </Button>
              <div className="text-center text-[11px] text-muted-foreground">F9 للتأكيد · لا تغلق الصفحة أثناء ظهور «جاري تسجيل البيع»</div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <InvoiceDialog isOpen={invoiceOpen} onClose={() => setInvoiceOpen(false)} sale={currentSale} />
      <BarcodeScanner isOpen={scannerOpen} onClose={() => setScannerOpen(false)} onScan={barcode => { setScannerOpen(false); void processBarcode(barcode); }} />
    </MainLayout>
  );
}
