import { useState, useEffect, useRef, useCallback } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { siteConfig } from "@/config/site";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, Barcode, ShoppingCart, Plus, Minus, Trash2, CreditCard, Tag, Receipt, Scale, Box, CreditCard as CardIcon, Banknote, Check, X, ScanLine, Printer, User, Wallet } from "lucide-react";
import { CartItem, Product, Sale, Customer } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { fetchProducts, fetchProductByBarcode } from "@/services/supabase/productService";
import { createSale, generateInvoiceNumber } from "@/services/supabase/saleService";
import { fetchCustomers, findOrCreateCustomer } from "@/services/supabase/customerService";
import { RegisterType, getLatestCashBalance } from "@/services/supabase/cashTrackingService";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import BarcodeScanner from "@/components/POS/BarcodeScanner";
import InvoiceDialog from "@/components/POS/InvoiceDialog";
import { bluetoothPrinterService } from '@/services/bluetoothPrinterService';
import { useAuth } from "@/contexts/AuthContext";

export default function POS() {
  const [search, setSearch] = useState("");
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [weightInput, setWeightInput] = useState<string>("");
  const [showWeightDialog, setShowWeightDialog] = useState(false);
  const [currentScaleProduct, setCurrentScaleProduct] = useState<Product | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<string>("");
  const [cashBalance, setCashBalance] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'mixed'>('cash');
  const [cashAmount, setCashAmount] = useState<string>("");
  const [cardAmount, setCardAmount] = useState<string>("");
  const [customerName, setCustomerName] = useState<string>("");
  const [customerPhone, setCustomerPhone] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [currentInvoiceNumber, setCurrentInvoiceNumber] = useState<string>("");
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [barcodeBuffer, setBarcodeBuffer] = useState<string>("");
  const [showInvoice, setShowInvoice] = useState(false);
  const [currentSale, setCurrentSale] = useState<Sale | null>(null);
  const [manualBarcodeMode, setManualBarcodeMode] = useState(false);
  const [searchDebounceTimeoutRef, setSearchDebounceTimeoutRef] = useState<NodeJS.Timeout | null>(null);
  const barcodeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const lastSearchRef = useRef<string>("");
  const {
    toast
  } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        const [productsData, customersData, balance] = await Promise.all([
          fetchProducts(),
          fetchCustomers(),
          getLatestCashBalance(RegisterType.STORE)
        ]);
        setProducts(productsData);
        setCustomers(customersData);
        setCashBalance(balance);
      } catch (error) {
        console.error("Error loading data:", error);
        toast({
          title: "خطأ في تحميل البيانات",
          description: "حدث خطأ أثناء تحميل البيانات، يرجى المحاولة مرة أخرى.",
          variant: "destructive"
        });
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [toast]);

  // Smart search effect
  useEffect(() => {
    // Clear previous timeout
    if (searchDebounceTimeoutRef) {
      clearTimeout(searchDebounceTimeoutRef);
    }

    // Don't search if empty or same as last search
    if (!search.trim() || search.trim() === lastSearchRef.current) {
      return;
    }

    const isNumeric = /^\d+$/.test(search.trim());
    const searchValue = search.trim();

    if (isNumeric && searchValue.length >= 3) {
      // Immediate search for numbers (barcodes)
      const timeoutId = setTimeout(() => {
        handleSearchInternal(searchValue);
        lastSearchRef.current = searchValue;
      }, 200);
      setSearchDebounceTimeoutRef(timeoutId);
    } else if (!isNumeric && searchValue.length >= 2) {
      // Delayed search for text (product names)
      const timeoutId = setTimeout(() => {
        handleSearchInternal(searchValue);
        lastSearchRef.current = searchValue;
      }, 800);
      setSearchDebounceTimeoutRef(timeoutId);
    }

    return () => {
      if (searchDebounceTimeoutRef) {
        clearTimeout(searchDebounceTimeoutRef);
      }
    };
  }, [search]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchDebounceTimeoutRef) {
        clearTimeout(searchDebounceTimeoutRef);
      }
    };
  }, []);

  useEffect(() => {
    if (!manualBarcodeMode) {
      // Detect Android
      const isAndroid = /Android/i.test(navigator.userAgent);
      
      const handleKeyDown = (e: KeyboardEvent) => {
        const target = e.target as HTMLElement;
        const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
        const isSearchInput = target === searchInputRef.current;
        if (isInput && !isSearchInput) return;
        
        console.log("Key pressed:", e.key, "Current buffer:", barcodeBuffer);
        
        // Handle Enter key - process current buffer
        if (e.key === 'Enter' && barcodeBuffer) {
          e.preventDefault();
          console.log("External barcode scanned:", barcodeBuffer);
          processBarcode(barcodeBuffer);
          setBarcodeBuffer("");
          return;
        }
        
        // Handle alphanumeric characters
        if (/^[a-zA-Z0-9]$/.test(e.key)) {
          if (barcodeTimeoutRef.current) {
            clearTimeout(barcodeTimeoutRef.current);
          }
          setBarcodeBuffer(prev => prev + e.key);
          
          // Different timeout for Android vs other platforms
          const timeoutDuration = isAndroid ? 1000 : 500;
          
          barcodeTimeoutRef.current = setTimeout(() => {
            const currentBuffer = barcodeBuffer + e.key;
            if (currentBuffer.length >= 5) {
              console.log("Auto-processing barcode after timeout:", currentBuffer);
              processBarcode(currentBuffer);
              setBarcodeBuffer("");
            } else {
              if (!isInput) {
                setBarcodeBuffer("");
              }
            }
          }, timeoutDuration);
        }
      };

      // Enhanced input event listener for Android Bluetooth scanners
      const handleInput = (e: Event) => {
        const target = e.target as HTMLInputElement;
        if (target === searchInputRef.current) {
          const value = target.value.trim();
          console.log("Input event triggered:", value);
          
          // Process if it looks like a barcode (5+ characters)
          if (value.length >= 5) {
            processBarcode(value);
            target.value = "";
          }
        }
      };

      // Enhanced change listener for Android
      const handleChange = (e: Event) => {
        const target = e.target as HTMLInputElement;
        if (target === searchInputRef.current) {
          const value = target.value.trim();
          if (value.length >= 8) { // Longer barcodes
            console.log("Change event triggered:", value);
            processBarcode(value);
            target.value = "";
          }
        }
      };

      document.addEventListener('keydown', handleKeyDown);
      
      // Add multiple listeners for Android compatibility
      if (isAndroid && searchInputRef.current) {
        searchInputRef.current.addEventListener('input', handleInput);
        searchInputRef.current.addEventListener('change', handleChange);
        
        // Additional Android-specific handling
        searchInputRef.current.addEventListener('keyup', (e) => {
          if (e.key === 'Enter') {
            const target = e.target as HTMLInputElement;
            const value = target.value.trim();
            if (value.length >= 5) {
              processBarcode(value);
              target.value = "";
            }
          }
        });
      }
      
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        if (isAndroid && searchInputRef.current) {
          searchInputRef.current.removeEventListener('input', handleInput);
          searchInputRef.current.removeEventListener('change', handleChange);
        }
        if (barcodeTimeoutRef.current) {
          clearTimeout(barcodeTimeoutRef.current);
        }
      };
    }
  }, [barcodeBuffer, manualBarcodeMode]);

  const processBarcode = async (barcode: string) => {
    if (barcode.length < 5) return;
    
    try {
      setSearch(barcode);
      const product = await fetchProductByBarcode(barcode);
      
      if (product) {
        if (product.calculated_weight) {
          handleAddScaleProductToCart(product, product.calculated_weight);
        } else if (product.is_bulk_scan) {
          handleAddBulkToCart(product);
        } else {
          handleAddToCart(product);
        }
        toast({
          title: "تم المسح بنجاح",
          description: `${barcode} - ${product.name}`
        });
      } else {
        const bulkProduct = products.find(p => p.bulk_barcode === barcode && p.bulk_enabled);
        
        if (bulkProduct) {
          handleAddBulkToCart(bulkProduct);
          toast({
            title: "تم المسح بنجاح",
            description: `${barcode} - ${bulkProduct.name} (جملة)`
          });
          return;
        }
        
        if (barcode.startsWith("2") && barcode.length === 13) {
          const productCode = barcode.substring(1, 7);
          const scaleProduct = products.find(p => p.barcode_type === "scale" && p.barcode === productCode);
          if (scaleProduct) {
            const weightInGrams = parseInt(barcode.substring(7, 12));
            const weightInKg = weightInGrams / 1000;
            handleAddScaleProductToCart(scaleProduct, weightInKg);
            return;
          }
        }
        
        toast({
          title: "لم يتم العثور على المنتج",
          description: `لم يتم العثور على منتج بالباركود ${barcode}`,
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error("Error processing barcode:", error);
      toast({
        title: "خطأ في معالجة الباركود",
        description: "حدث خطأ أثناء معالجة الباركود. يرجى المحاولة مرة أخرى.",
        variant: "destructive"
      });
    }
  };

  const handleSearchInternal = async (searchValue: string) => {
    if (!searchValue) return;
    
    try {
      const product = await fetchProductByBarcode(searchValue);
      
      if (product) {
        if (product.calculated_weight) {
          handleAddScaleProductToCart(product, product.calculated_weight);
          setSearch("");
          return;
        } else if (product.is_bulk_scan) {
          handleAddBulkToCart(product);
          setSearch("");
          return;
        } else {
          handleAddToCart(product);
          setSearch("");
          return;
        }
      }

      const bulkProduct = products.find(p => p.bulk_barcode === searchValue && p.bulk_enabled);
      if (bulkProduct) {
        handleAddBulkToCart(bulkProduct);
        setSearch("");
        toast({
          title: "تم إضافة منتج جملة",
          description: `${bulkProduct.name} - ${bulkProduct.bulk_quantity} وحدة`
        });
        return;
      }

      if (searchValue.startsWith("2") && searchValue.length === 13) {
        const productCode = searchValue.substring(1, 7);
        const scaleProduct = products.find(p => p.barcode_type === "scale" && p.barcode === productCode);
        
        if (scaleProduct) {
          const weightInGrams = parseInt(searchValue.substring(7, 12));
          const weightInKg = weightInGrams / 1000;
          handleAddScaleProductToCart(scaleProduct, weightInKg);
          setSearch("");
          return;
        }
      }

      const results = products.filter(product => 
        product.barcode === searchValue || 
        product.name.toLowerCase().includes(searchValue.toLowerCase())
      );
      setSearchResults(results);

      const exactMatch = products.find(p => 
        p.barcode === searchValue && 
        p.barcode_type === "normal" && 
        !p.bulk_enabled
      );

      if (exactMatch) {
        handleAddToCart(exactMatch);
        setSearch("");
      } else if (results.length === 1 && results[0].barcode_type === "scale") {
        setCurrentScaleProduct(results[0]);
        setShowWeightDialog(true);
        setSearch("");
      }
    } catch (error) {
      console.error("Error searching for product:", error);
      toast({
        title: "خطأ في البحث",
        description: "حدث خطأ أثناء البحث عن المنتج",
        variant: "destructive"
      });
    }
  };

  const handleSearch = () => {
    handleSearchInternal(search);
  };

  const handleAddToCart = (product: Product) => {
    const existingItem = cartItems.find(item => item.product.id === product.id);
    if (existingItem) {
      setCartItems(cartItems.map(item => item.product.id === product.id ? {
        ...item,
        quantity: item.quantity + 1,
        total: (item.quantity + 1) * (product.is_offer && product.offer_price ? product.offer_price : product.price)
      } : item));
    } else {
      const price = product.is_offer && product.offer_price ? product.offer_price : product.price;
      setCartItems([...cartItems, {
        product,
        quantity: 1,
        price,
        discount: product.is_offer && product.offer_price ? product.price - product.offer_price : 0,
        total: price,
        weight: null
      }]);
    }
    setSearchResults([]);
  };

  const handleAddScaleProductToCart = (product: Product, weight: number) => {
    if ((product.quantity || 0) <= 0) {
      toast({
        title: "المنتج غير متوفر",
        description: `المنتج "${product.name}" غير متوفر في المخزون`,
        variant: "destructive"
      });
      return;
    }
    const itemPrice = product.price * weight;
    const discountPerKg = product.is_offer && product.offer_price ? product.price - product.offer_price : 0;
    setCartItems([...cartItems, {
      product,
      quantity: 1,
      price: itemPrice,
      discount: discountPerKg * weight,
      total: itemPrice,
      weight: weight
    }]);
    toast({
      title: "تم إضافة منتج بالوزن",
      description: `${product.name} - ${weight} كجم`
    });
    setSearchResults([]);
    setShowWeightDialog(false);
    setCurrentScaleProduct(null);
    setWeightInput("");
  };

  const handleAddBulkToCart = (product: Product) => {
    if ((product.quantity || 0) <= 0) {
      toast({
        title: "المنتج غير متوفر",
        description: `عبوة الجملة للمنتج "${product.name}" غير متوفرة في المخزون`,
        variant: "destructive"
      });
      return;
    }
    if (!product.bulk_enabled || !product.bulk_quantity || !product.bulk_price) {
      toast({
        title: "خطأ",
        description: "تفاصيل الجملة غير كاملة لهذا المنتج",
        variant: "destructive"
      });
      return;
    }
    
    setCartItems([...cartItems, {
      product,
      quantity: product.bulk_quantity,
      price: product.bulk_price / product.bulk_quantity,
      discount: 0,
      total: product.bulk_price,
      isBulk: true
    }]);
    toast({
      title: "تم إضافة عبوة جملة",
      description: `${product.name} - ${product.bulk_quantity} وحدة`
    });
    setSearchResults([]);
  };

  const handleWeightSubmit = () => {
    if (!currentScaleProduct || !weightInput) return;
    const weight = parseFloat(weightInput);
    if (isNaN(weight) || weight <= 0) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال وزن صحيح",
        variant: "destructive"
      });
      return;
    }
    handleAddScaleProductToCart(currentScaleProduct, weight);
  };

  const handleRemoveFromCart = (index: number) => {
    setCartItems(cartItems.filter((_, i) => i !== index));
  };

  const handleQuantityChange = (index: number, change: number) => {
    setCartItems(cartItems.map((item, i) => {
      if (i === index) {
        if (item.weight !== null && change > 0) return item;
        const newQuantity = Math.max(1, item.quantity + change);
        if (change > 0 && newQuantity > (item.product.quantity || 0)) {
          toast({
            title: "الكمية غير متوفرة",
            description: `الكمية المتوفرة من المنتج "${item.product.name}" هي ${item.product.quantity}`,
            variant: "destructive"
          });
          return item;
        }
        let price = item.price;
        let total = item.weight !== null ? item.price : newQuantity * price;
        return {
          ...item,
          quantity: newQuantity,
          total
        };
      }
      return item;
    }));
  };

  const openCheckout = () => {
    if (cartItems.length === 0) return;
    
    // Set customer data if selected
    if (selectedCustomer && selectedCustomer !== "none") {
      const customer = customers.find(c => c.id === selectedCustomer);
      if (customer) {
        setCustomerName(customer.name);
        setCustomerPhone(customer.phone || "");
      }
    }
    
    setIsCheckoutOpen(true);
    setCashAmount(total.toFixed(2));
    setCardAmount("");
  };

  const handlePaymentMethodChange = (value: 'cash' | 'card' | 'mixed') => {
    setPaymentMethod(value);
    if (value === 'cash') {
      setCashAmount(total.toFixed(2));
      setCardAmount("");
    } else if (value === 'card') {
      setCashAmount("");
      setCardAmount(total.toFixed(2));
    } else {
      setCashAmount("");
      setCardAmount("");
    }
  };

  const calculateChange = () => {
    if (paymentMethod === 'card') return 0;
    const cashAmountNum = parseFloat(cashAmount || "0");
    return Math.max(0, cashAmountNum - total);
  };

  const validatePayment = () => {
    if (paymentMethod === 'cash') {
      const cashAmountNum = parseFloat(cashAmount || "0");
      return cashAmountNum >= total;
    } else if (paymentMethod === 'card') {
      const cardAmountNum = parseFloat(cardAmount || "0");
      return cardAmountNum === total;
    } else {
      const cashAmountNum = parseFloat(cashAmount || "0");
      const cardAmountNum = parseFloat(cardAmount || "0");
      return cashAmountNum + cardAmountNum === total;
    }
  };

  const recordSaleToCashRegister = async (amount: number, paymentMethod: string) => {
    if (paymentMethod !== 'cash' && paymentMethod !== 'mixed') return;
    const amountToRecord = paymentMethod === 'cash' ? amount : parseFloat(cashAmount || "0");
    if (amountToRecord <= 0) return;
    try {
      const {
        data,
        error
      } = await supabase.functions.invoke('add-cash-transaction', {
        body: {
          amount: amountToRecord,
          transaction_type: 'deposit',
          register_type: 'store',
          notes: 'مبيعات نقطة البيع'
        }
      });
      if (error) throw error;
      console.log('Sale recorded to cash register:', data);
    } catch (error) {
      console.error('Error recording sale to cash register:', error);
    }
  };

  const completeSale = async () => {
    if (!validatePayment()) {
      toast({
        title: "خطأ في إتمام البيع",
        description: "يرجى التأكد من صحة المبالغ المدخلة.",
        variant: "destructive"
      });
      return;
    }
    setIsProcessing(true);
    try {
      let customerData = null;
      if (customerName || customerPhone) {
        customerData = await findOrCreateCustomer({
          name: customerName,
          phone: customerPhone
        });
        if (customerData) {
          console.log("Customer data saved:", customerData);
        }
      }
      const invoiceNumber = await generateInvoiceNumber();
      setCurrentInvoiceNumber(invoiceNumber);
      const profit = cartItems.reduce((sum, item) => {
        const itemCost = item.product.purchase_price * (item.weight || item.quantity);
        return sum + (item.total - itemCost);
      }, 0);
      const saleData: Omit<Sale, "id" | "created_at" | "updated_at"> = {
        date: new Date().toISOString(),
        items: cartItems,
        subtotal: subtotal,
        discount: discount,
        total: total,
        profit: profit,
        payment_method: paymentMethod,
        cash_amount: paymentMethod === 'card' ? undefined : parseFloat(cashAmount || "0"),
        card_amount: paymentMethod === 'cash' ? undefined : parseFloat(cardAmount || "0"),
        customer_name: customerName || undefined,
        customer_phone: customerPhone || undefined,
        invoice_number: invoiceNumber,
        cashier_name: user?.name
      };
      const sale = await createSale(saleData, user?.name);
      setCurrentSale(sale);
      if (paymentMethod === 'cash' || paymentMethod === 'mixed') {
        await recordSaleToCashRegister(paymentMethod === 'cash' ? total : parseFloat(cashAmount || "0"), paymentMethod);
      }
      toast({
        title: "تم إتمام البيع بنجاح",
        description: `رقم الفاتورة: ${sale.invoice_number}`
      });
      setShowSuccess(true);
      
      // طباعة الفاتورة تلقائياً إذا كانت الطابعة متصلة
      if (bluetoothPrinterService.isConnected()) {
        const storeInfo = {
          name: siteConfig.name,
          address: siteConfig.address || "العنوان غير متوفر",
          phone: siteConfig.phone || "الهاتف غير متوفر",
          currency: siteConfig.currency || 'ج.م'
        };
        
        const invoiceText = bluetoothPrinterService.generateInvoiceText(sale, storeInfo);
        setTimeout(() => {
          bluetoothPrinterService.printText(invoiceText);
        }, 1000);
      }
      
      // Clear cart after successful sale
      setTimeout(() => {
        resetSale();
        // Refresh cash balance
        getLatestCashBalance(RegisterType.STORE).then(setCashBalance);
      }, 2000);
    } catch (error) {
      console.error("Error completing sale:", error);
      toast({
        title: "خطأ في إتمام البيع",
        description: "حدث خطأ أثناء حفظ بيانات البيع، يرجى المحاولة مرة أخرى.",
        variant: "destructive"
      });
      setIsProcessing(false);
    }
  };

  const resetSale = () => {
    setCartItems([]);
    setSearchResults([]);
    setSearch("");
    setSelectedCustomer("");
    setIsCheckoutOpen(false);
    setShowSuccess(false);
    setIsProcessing(false);
    setPaymentMethod('cash');
    setCashAmount("");
    setCardAmount("");
    setCustomerName("");
    setCustomerPhone("");
    setCurrentInvoiceNumber("");
    setCurrentSale(null);
  };

  const handleViewInvoice = () => {
    if (currentSale) {
      setShowInvoice(true);
    }
  };

  const handlePreviewInvoice = () => {
    if (cartItems.length === 0) return;
    const tempSale: Sale = {
      id: 'temp',
      date: new Date().toISOString(),
      items: cartItems,
      subtotal: subtotal,
      discount: discount,
      total: total,
      profit: 0,
      payment_method: 'cash',
      invoice_number: 'PREVIEW',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      customer_name: customerName || undefined,
      customer_phone: customerPhone || undefined
    };
    setCurrentSale(tempSale);
    setShowInvoice(true);
  };

  const handleBarcodeScan = async (barcode: string) => {
    processBarcode(barcode);
  };

  const subtotal = cartItems.reduce((sum, item) => sum + item.total, 0);
  const discount = cartItems.reduce((sum, item) => sum + item.discount * item.quantity, 0);
  const total = subtotal;

  return <MainLayout>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">نقطة البيع</h1>
        <p className="text-muted-foreground">
          {new Date().toLocaleDateString('ar-EG', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })}
        </p>
      </div>
      
      <div className="relative mb-4 bg-muted/30 p-3 rounded-lg border border-muted flex items-center">
        <ScanLine className="h-5 w-5 text-primary ml-3" />
        <div className="flex-1">
          <h3 className="font-medium">وضع مسح الباركود {manualBarcodeMode ? "يدوي" : "تلقائي"}</h3>
          <p className="text-sm text-muted-foreground">
            {manualBarcodeMode 
              ? "اكتب الباركود يدوياً ثم اضغط على Enter أو زر البحث"
              : "قم بتوصيل قارئ الباركود واستخدامه لمسح المنتجات مباشرة، أو اضغط على زر \"مسح\" لاستخدام الكاميرا"}
          </p>
        </div>
        <Button variant="outline" onClick={() => setManualBarcodeMode(!manualBarcodeMode)} className="mr-2">
          تبديل الوضع {manualBarcodeMode ? "تلقائي" : "يدوي"}
        </Button>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>بحث المنتجات</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-4">
                <Input 
                  placeholder="ابحث بالباركود أو اسم المنتج (اكتب مباشرة)" 
                  value={search} 
                  onChange={e => setSearch(e.target.value)} 
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleSearch();
                  }} 
                  className="flex-1" 
                  ref={searchInputRef}
                  inputMode="text"
                  autoComplete="off"
                  enterKeyHint="search"
                />
                <Button onClick={handleSearch}>
                  <Search className="ml-2 h-4 w-4" />
                  بحث
                </Button>
                <Button variant="outline" onClick={() => setShowBarcodeScanner(true)}>
                  <Barcode className="ml-2 h-4 w-4" />
                  مسح
                </Button>
              </div>
              
              {showWeightDialog && currentScaleProduct && <div className="border rounded-lg p-4 mb-4 bg-muted/10">
                  <div className="flex items-center mb-3">
                    <Scale className="h-5 w-5 ml-2 text-primary" />
                    <h3 className="font-semibold">إدخال الوزن - {currentScaleProduct.name}</h3>
                  </div>
                  
                  <div className="flex gap-2">
                    <Input placeholder="أدخل الوزن بالكيلوجرام" type="number" step="0.001" value={weightInput} onChange={e => setWeightInput(e.target.value)} onKeyDown={e => {
                  if (e.key === 'Enter') handleWeightSubmit();
                }} className="flex-1" />
                    <span className="flex items-center ml-2 text-sm text-muted-foreground">كجم</span>
                    <Button onClick={handleWeightSubmit}>إضافة</Button>
                    <Button variant="outline" onClick={() => {
                  setShowWeightDialog(false);
                  setCurrentScaleProduct(null);
                  setWeightInput("");
                }}>
                      إلغاء
                    </Button>
                  </div>
                </div>}
              
              {searchResults.length > 0 && <div className="border rounded-lg p-4 space-y-4">
                  <h3 className="font-semibold">نتائج البحث</h3>
                  
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {searchResults.map(product => <Card key={product.id} className="cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => {
                  if (product.barcode_type === "scale") {
                    setCurrentScaleProduct(product);
                    setShowWeightDialog(true);
                  } else {
                    handleAddToCart(product);
                  }
                }}>
                        <CardContent className="p-3">
                          <div className="aspect-square rounded bg-gray-100 flex items-center justify-center mb-2">
                            <img src={product.image_urls?.[0] || "/placeholder.svg"} alt={product.name} className="h-16 w-16 object-contain" />
                          </div>
                          <h4 className="text-sm font-medium line-clamp-2">{product.name}</h4>
                          
                          <div className="flex gap-1 my-1">
                            {product.barcode_type === "scale" && <span className="bg-blue-100 text-blue-800 text-xs rounded px-1.5 py-0.5 flex items-center">
                                <Scale className="h-3 w-3 ml-1" />
                                بالوزن
                              </span>}
                            {product.bulk_enabled && <span className="bg-amber-100 text-amber-800 text-xs rounded px-1.5 py-0.5 flex items-center">
                                <Box className="h-3 w-3 ml-1" />
                                جملة
                              </span>}
                          </div>
                          
                          <div className="flex justify-between items-center mt-2">
                            <p className="text-sm font-bold">
                              {product.barcode_type === "scale" ? <span>{product.price} / كجم</span> : product.is_offer && product.offer_price ? <>
                                  <span className="text-primary">{product.offer_price}</span>
                                  <span className="mr-1 text-xs text-muted-foreground line-through">{product.price}</span>
                                </> : <span>{product.price}</span>}
                              <span className="mr-1 text-xs">{siteConfig.currency}</span>
                            </p>
                            {product.is_offer && <Tag className="h-4 w-4 text-primary" />}
                          </div>
                        </CardContent>
                      </Card>)}
                  </div>
                </div>}
              
              <div className="mt-6">
                <h3 className="font-semibold mb-4">المنتجات المقترحة</h3>
                
                {isLoading ? <div className="flex justify-center items-center h-40">
                    <p className="text-muted-foreground">جاري تحميل المنتجات...</p>
                  </div> : products.length === 0 ? <div className="text-center py-6 text-muted-foreground">
                    <p>لا توجد منتجات متاحة</p>
                  </div> : <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {products.slice(0, 8).map(product => <Card key={product.id} className="cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => {
                  if (product.barcode_type === "scale") {
                    setCurrentScaleProduct(product);
                    setShowWeightDialog(true);
                  } else {
                    handleAddToCart(product);
                  }
                }}>
                        <CardContent className="p-3">
                          <div className="aspect-square rounded bg-gray-100 flex items-center justify-center mb-2">
                            <img src={product.image_urls?.[0] || "/placeholder.svg"} alt={product.name} className="h-16 w-16 object-contain" />
                          </div>
                          <h4 className="text-sm font-medium line-clamp-2">{product.name}</h4>
                          
                          <div className="flex gap-1 my-1">
                            {product.barcode_type === "scale" && <span className="bg-blue-100 text-blue-800 text-xs rounded px-1.5 py-0.5 flex items-center">
                                <Scale className="h-3 w-3 ml-1" />
                                بالوزن
                              </span>}
                            {product.bulk_enabled && <span className="bg-amber-100 text-amber-800 text-xs rounded px-1.5 py-0.5 flex items-center">
                                <Box className="h-3 w-3 ml-1" />
                                جملة
                              </span>}
                          </div>
                          
                          <div className="flex justify-between items-center mt-2">
                            <p className="text-sm font-bold">
                              {product.barcode_type === "scale" ? <span>{product.price} / كجم</span> : product.is_offer && product.offer_price ? <>
                                  <span className="text-primary">{product.offer_price}</span>
                                  <span className="mr-1 text-xs text-muted-foreground line-through">{product.price}</span>
                                </> : <span>{product.price}</span>}
                              <span className="mr-1 text-xs">{siteConfig.currency}</span>
                            </p>
                            {product.is_offer && <Tag className="h-4 w-4 text-primary" />}
                          </div>
                        </CardContent>
                      </Card>)}
                  </div>}
              </div>
            </CardContent>
          </Card>
        </div>
        
        <div>
          <Card className="sticky top-6">
            <CardHeader className="pb-3">
              <div className="flex justify-between items-center">
                <CardTitle>سلة المشتريات</CardTitle>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Wallet className="w-4 h-4" />
                    {cashBalance.toFixed(2)} ج.م
                  </div>
                  <ShoppingCart className="h-5 w-5 text-muted-foreground" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {cartItems.length === 0 ? <div className="text-center py-6 text-muted-foreground">
                  <ShoppingCart className="h-10 w-10 mx-auto mb-2 opacity-20" />
                  <p>السلة فارغة</p>
                </div> : <>
                  <div className="space-y-4 max-h-[400px] overflow-y-auto">
                    {cartItems.map((item, index) => <div key={index} className="flex flex-col pb-3 border-b">
                        <div className="flex justify-between">
                          <div className="flex-1">
                            <h4 className="font-medium">{item.product.name}</h4>
                            <div className="flex text-sm space-x-1 text-muted-foreground">
                              {item.weight ? <span className="ml-1">
                                  {item.product.price} {siteConfig.currency}/كجم × {item.weight} كجم
                                </span> : item.isBulk ? <span className="ml-1">
                                  عبوة جملة {item.quantity} وحدة
                                </span> : <span className="ml-1">
                                  {item.product.is_offer && item.product.offer_price ? item.product.offer_price : item.product.price} {siteConfig.currency}
                                  {item.product.is_offer && item.product.offer_price && <span className="line-through mr-1">{item.product.price} {siteConfig.currency}</span>}
                                </span>}
                            </div>
                          </div>
                          
                          <div className="text-right">
                            <p className="font-bold">{item.total.toFixed(2)} {siteConfig.currency}</p>
                          </div>
                        </div>
                        
                        <div className="flex justify-between items-center mt-2">
                          {item.weight === null && !item.isBulk ? <div className="flex items-center space-x-2">
                              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => handleQuantityChange(index, -1)}>
                                <Minus className="h-3 w-3" />
                              </Button>
                              
                              <span className="w-8 text-center">{item.quantity}</span>
                              
                              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => handleQuantityChange(index, 1)}>
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div> : item.weight ? <div className="flex items-center">
                              <Scale className="h-4 w-4 text-blue-500 ml-1" />
                              <span className="text-sm">{item.weight} كجم</span>
                            </div> : <div className="flex items-center">
                              <Box className="h-4 w-4 text-amber-500 ml-1" />
                              <span className="text-sm">{item.quantity} وحدة</span>
                            </div>}
                          
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleRemoveFromCart(index)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>)}
                  </div>
                  
                  <div className="space-y-2 pt-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">المجموع الفرعي</span>
                      <span>{subtotal.toFixed(2)} {siteConfig.currency}</span>
                    </div>
                    {discount > 0 && <div className="flex justify-between text-primary">
                        <span>الخصم</span>
                        <span>- {discount.toFixed(2)} {siteConfig.currency}</span>
                      </div>}
                    <div className="flex justify-between font-bold text-lg pt-2 border-t">
                      <span>الإجمالي</span>
                      <span>{total.toFixed(2)} {siteConfig.currency}</span>
                    </div>
                  </div>
                </>}
            </CardContent>
            <CardFooter className="flex flex-col space-y-2 pt-0">
              {/* Customer Selection */}
              <div className="w-full space-y-2">
                <Label htmlFor="customer-select" className="text-sm font-medium">
                  اختيار عميل (اختياري)
                </Label>
                <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر عميل موجود" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون عميل</SelectItem>
                    {customers.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4" />
                          {customer.name} {customer.phone && `- ${customer.phone}`}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <Button className="w-full" size="lg" disabled={cartItems.length === 0} onClick={openCheckout}>
                <CreditCard className="ml-2 h-4 w-4" />
                إتمام الشراء
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
      
      <Dialog open={isCheckoutOpen} onOpenChange={setIsCheckoutOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>إتمام عملية البيع</DialogTitle>
          </DialogHeader>
          
          {showSuccess ? <div className="space-y-4 py-4">
              <div className="flex flex-col items-center justify-center space-y-2">
                <div className="rounded-full bg-green-100 p-3">
                  <Check className="h-6 w-6 text-green-600" />
                </div>
                <h3 className="font-semibold text-lg">تمت عملية البيع بنجاح</h3>
                <p className="text-muted-foreground text-center">تم تسجيل عملية البيع بنجاح برقم فاتورة:</p>
                <p className="font-bold text-lg">{currentInvoiceNumber}</p>
              </div>
              
              <div className="flex flex-col space-y-2">
                <Button onClick={handleViewInvoice} className="w-full">
                  <Printer className="ml-2 h-4 w-4" />
                  عرض وطباعة الفاتورة
                </Button>
                <Button onClick={resetSale} className="w-full">
                  عملية بيع جديدة
                </Button>
              </div>
            </div> : <>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <h3 className="font-semibold">معلومات العميل (اختياري)</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="customerName">اسم العميل</Label>
                      <Input id="customerName" value={customerName} onChange={e => setCustomerName(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="customerPhone">رقم الهاتف</Label>
                      <Input id="customerPhone" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <h3 className="font-semibold">طريقة الدفع</h3>
                  <RadioGroup value={paymentMethod} onValueChange={value => handlePaymentMethodChange(value as 'cash' | 'card' | 'mixed')} className="flex space-x-2 space-x-reverse">
                    <div className="flex items-center space-x-2 space-x-reverse">
                      <RadioGroupItem value="cash" id="cash" />
                      <Label htmlFor="cash" className="flex items-center">
                        <Banknote className="ml-2 h-4 w-4" />
                        نقدي
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2 space-x-reverse">
                      <RadioGroupItem value="card" id="card" />
                      <Label htmlFor="card" className="flex items-center">
                        <CardIcon className="ml-2 h-4 w-4" />
                        بطاقة
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2 space-x-reverse">
                      <RadioGroupItem value="mixed" id="mixed" />
                      <Label htmlFor="mixed" className="flex items-center">
                        <CardIcon className="ml-2 h-4 w-4" />
                        مختلط
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
                
                <div className="space-y-3">
                  <h3 className="font-semibold">تفاصيل الدفع</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {(paymentMethod === 'cash' || paymentMethod === 'mixed') && <div className="space-y-1">
                        <Label htmlFor="cashAmount" className="flex items-center">
                          <Banknote className="ml-2 h-4 w-4" />
                          المبلغ النقدي
                        </Label>
                        <Input id="cashAmount" type="number" step="0.01" min="0" value={cashAmount} onChange={e => setCashAmount(e.target.value)} />
                      </div>}
                    
                    {(paymentMethod === 'card' || paymentMethod === 'mixed') && <div className="space-y-1">
                        <Label htmlFor="cardAmount" className="flex items-center">
                          <CardIcon className="ml-2 h-4 w-4" />
                          مبلغ البطاقة
                        </Label>
                        <Input id="cardAmount" type="number" step="0.01" min="0" value={cardAmount} onChange={e => setCardAmount(e.target.value)} />
                      </div>}
                  </div>
                  
                  {paymentMethod === 'mixed' && <div className="text-sm">
                      <span className="text-muted-foreground">مجموع الدفع: </span>
                      <span className={`font-bold ${parseFloat(cashAmount || "0") + parseFloat(cardAmount || "0") !== total ? "text-red-500" : "text-green-500"}`}>
                        {(parseFloat(cashAmount || "0") + parseFloat(cardAmount || "0")).toFixed(2)} {siteConfig.currency}
                      </span>
                    </div>}
                  
                  {paymentMethod === 'cash' && parseFloat(cashAmount || "0") > total && <div className="text-sm">
                      <span className="text-muted-foreground">المبلغ المتبقي: </span>
                      <span className="font-bold">{calculateChange().toFixed(2)} {siteConfig.currency}</span>
                    </div>}
                </div>
                
                <div className="rounded-lg bg-muted p-3">
                  <div className="flex justify-between font-bold">
                    <span>الإجمالي:</span>
                    <span>{total.toFixed(2)} {siteConfig.currency}</span>
                  </div>
                </div>
              </div>
              
              <DialogFooter className="sm:justify-start">
                <Button type="submit" disabled={isProcessing || !validatePayment()} onClick={completeSale}>
                  {isProcessing ? "جاري المعالجة..." : "تأكيد البيع"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setIsCheckoutOpen(false)}>
                  إلغاء
                </Button>
              </DialogFooter>
            </>}
        </DialogContent>
      </Dialog>
      
      <InvoiceDialog isOpen={showInvoice} onClose={() => setShowInvoice(false)} sale={currentSale} />
      
      <BarcodeScanner isOpen={showBarcodeScanner} onClose={() => setShowBarcodeScanner(false)} onScan={handleBarcodeScan} />
    </MainLayout>;
}
