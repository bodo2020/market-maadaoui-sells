import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import MainLayout from "@/components/layout/MainLayout";
import { Product, CartItem } from "@/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/data/mockData";
import { useCart } from "@/hooks/use-cart";
import { useToast } from "@/hooks/use-toast";
import { Search, ShoppingCart, X, Plus, Minus, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "@radix-ui/react-icons";
import { format } from "date-fns";
import { enUS } from 'date-fns/locale';
import { DateRange } from "react-day-picker";
import { addDays } from "date-fns";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { createSale, generateInvoiceNumber, printInvoice } from "@/services/supabase/saleService";
import { useStore } from "@/stores/store";
import { StoreSettingsDialog } from "@/components/settings/StoreSettingsDialog";

export default function POS() {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [total, setTotal] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'mixed'>('cash');
  const [cashAmount, setCashAmount] = useState(0);
  const [cardAmount, setCardAmount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [bulkSelectModalOpen, setBulkSelectModalOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [isPrinting, setIsPrinting] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isBarcodeScanning, setIsBarcodeScanning] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState("");
  const [isBarcodeModalOpen, setIsBarcodeModalOpen] = useState(false);
  const [barcodeInputValue, setBarcodeInputValue] = useState("");
  const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);
  const [weightInputValue, setWeightInputValue] = useState("");
  const [selectedWeightItem, setSelectedWeightItem] = useState<CartItem | null>(null);

  const { toast } = useToast();
  const { storeInfo } = useStore();

  useEffect(() => {
    fetchProducts();
    generateNewInvoiceNumber();
  }, []);

  useEffect(() => {
    updateTotals();
  }, [cart, discount]);

  useEffect(() => {
    if (scannedBarcode) {
      handleBarcodeSearch(scannedBarcode);
      setScannedBarcode("");
    }
  }, [scannedBarcode]);

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("name", { ascending: true });

      if (error) {
        console.error("Error fetching products:", error);
        toast({
          title: "Error",
          description: "Failed to fetch products.",
          variant: "destructive",
        });
      }

      setProducts(data || []);
    } catch (error) {
      console.error("Unexpected error fetching products:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred while fetching products.",
        variant: "destructive",
      });
    }
  };

  const generateNewInvoiceNumber = async () => {
    try {
      const newInvoiceNumber = await generateInvoiceNumber();
      setInvoiceNumber(newInvoiceNumber);
    } catch (error) {
      console.error("Error generating invoice number:", error);
      toast({
        title: "Error",
        description: "Failed to generate invoice number.",
        variant: "destructive",
      });
    }
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const handleBarcodeSearch = async (barcode: string) => {
    try {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("barcode", barcode)
        .single();

      if (error) {
        console.error("Error fetching product by barcode:", error);
        toast({
          title: "Error",
          description: "Product not found with this barcode.",
          variant: "destructive",
        });
        return;
      }

      handleAddToCart(data);
    } catch (error) {
      console.error("Unexpected error fetching product by barcode:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred while fetching the product.",
        variant: "destructive",
      });
    }
  };

  const handleAddToCart = (product: Product) => {
    if (!product) return;

    // For bulk items with bulk_enabled, give the option to add as normal or bulk
    if (product.bulk_enabled) {
      setSelectedProduct(product);
      setBulkSelectModalOpen(true);
      return;
    }

    // Default add as regular item
    addRegularItemToCart(product);
  };

  const addRegularItemToCart = (product: Product) => {
    const existingItemIndex = cart.findIndex(item => 
      item.product.id === product.id && !item.isBulk
    );

    if (existingItemIndex >= 0) {
      // Update quantity of existing item
      const newCart = [...cart];
      newCart[existingItemIndex].quantity += 1;
      newCart[existingItemIndex].total = newCart[existingItemIndex].quantity * newCart[existingItemIndex].price;
      setCart(newCart);
    } else {
      // Add new item to cart
      const newItem: CartItem = {
        product,
        quantity: 1,
        price: product.is_offer && product.offer_price ? product.offer_price : product.price,
        discount: product.is_offer && product.offer_price ? product.price - product.offer_price : 0,
        total: product.is_offer && product.offer_price ? product.offer_price : product.price,
        weight: null, // Add the required weight property
        isBulk: false
      };
      setCart([...cart, newItem]);
    }

    updateTotals();
    showAddToCartToast(product);
  };

  const addBulkItemToCart = (product: Product, isBulk: boolean) => {
    // Add the item to the cart based on whether it's bulk or regular
    const price = isBulk && product.bulk_price ? product.bulk_price : (product.is_offer && product.offer_price ? product.offer_price : product.price);
    const quantity = isBulk && product.bulk_quantity ? product.bulk_quantity : 1;
    const total = price * quantity;
    const discount = product.is_offer && product.offer_price ? (product.price - product.offer_price) * quantity : 0;

    const newItem: CartItem = {
      product,
      quantity,
      price,
      discount,
      total,
      weight: null, // Add the required weight property
      isBulk
    };

    setCart([...cart, newItem]);
    updateTotals();
    showAddToCartToast(product, isBulk);
  };

  const handleRemoveFromCart = (index: number) => {
    const newCart = [...cart];
    newCart.splice(index, 1);
    setCart(newCart);
    updateTotals();
  };

  const handleQuantityChange = (index: number, quantity: number) => {
    if (quantity < 0) return;

    const newCart = [...cart];
    newCart[index].quantity = quantity;
    newCart[index].total = quantity * newCart[index].price;
    setCart(newCart);
    updateTotals();
  };

  const handleWeightChange = (index: number, weight: number | null) => {
    if (weight === null || weight < 0) return;
  
    const newCart = [...cart];
    newCart[index].weight = weight;
    newCart[index].total = weight * newCart[index].price;
    setCart(newCart);
    updateTotals();
  };

  const updateTotals = () => {
    let newTotal = cart.reduce((acc, item) => acc + item.total, 0);
    newTotal = newTotal - discount;
    setTotal(newTotal);
  };

  const handleDiscountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDiscount = Number(e.target.value);
    setDiscount(newDiscount);
    updateTotals();
  };

  const handlePaymentMethodChange = (method: 'cash' | 'card' | 'mixed') => {
    setPaymentMethod(method);
  };

  const handleCashAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCashAmount(Number(e.target.value));
  };

  const handleCardAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCardAmount(Number(e.target.value));
  };

  const handleSubmit = async () => {
    if (cart.length === 0) {
      toast({
        title: "Error",
        description: "Cart is empty.",
        variant: "destructive",
      });
      return;
    }

    if (paymentMethod === 'mixed' && (cashAmount + cardAmount) !== total) {
      toast({
        title: "Error",
        description: "Cash and Card amounts must equal the total amount.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSubmitting(true);

      const saleData = {
        date: date || new Date(),
        items: cart,
        subtotal: cart.reduce((acc, item) => acc + item.total, 0),
        discount: discount,
        total: total,
        profit: cart.reduce((acc, item) => acc + ((item.product.price - item.product.purchase_price) * item.quantity), 0) - discount,
        payment_method: paymentMethod,
        cash_amount: paymentMethod === 'cash' || paymentMethod === 'mixed' ? cashAmount : 0,
        card_amount: paymentMethod === 'card' || paymentMethod === 'mixed' ? cardAmount : 0,
        customer_name: customerName,
        customer_phone: customerPhone,
        invoice_number: invoiceNumber,
      };

      await createSale(saleData);

      toast({
        title: "Success",
        description: "Sale recorded successfully.",
      });

      resetCart();
      generateNewInvoiceNumber();
    } catch (error) {
      console.error("Error creating sale:", error);
      toast({
        title: "Error",
        description: "Failed to record sale.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetCart = () => {
    setIsResetting(true);
    setCart([]);
    setTotal(0);
    setDiscount(0);
    setPaymentMethod('cash');
    setCashAmount(0);
    setCardAmount(0);
    setCustomerName("");
    setCustomerPhone("");
    setIsResetting(false);
  };

  const showAddToCartToast = (product: Product, isBulk: boolean = false) => {
    toast({
      title: "تمت الإضافة إلى السلة",
      description: isBulk ? `تمت إضافة ${product.bulk_quantity} ${product.name} (بالجملة) إلى السلة.` : `تمت إضافة ${product.name} إلى السلة.`,
    });
  };

  const filteredProducts = products.filter((product) =>
    product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (product.barcode && product.barcode.includes(searchQuery))
  );

  const handlePrintInvoice = async () => {
    if (!storeInfo) {
      toast({
        title: "Error",
        description: "Store information not loaded. Please check your settings.",
        variant: "destructive",
      });
      return;
    }
    
    if (cart.length === 0) {
      toast({
        title: "Error",
        description: "Cart is empty. Add items to the cart before printing.",
        variant: "destructive",
      });
      return;
    }
    
    setIsPrinting(true);
    
    // Prepare sale data for invoice generation
    const saleData = {
      id: 'temp', // Temporary ID
      date: date?.toISOString() || new Date().toISOString(),
      items: cart,
      subtotal: cart.reduce((acc, item) => acc + item.total, 0),
      discount: discount,
      total: total,
      profit: cart.reduce((acc, item) => acc + ((item.product.price - item.product.purchase_price) * item.quantity), 0) - discount,
      payment_method: paymentMethod,
      cash_amount: paymentMethod === 'cash' || paymentMethod === 'mixed' ? cashAmount : 0,
      card_amount: paymentMethod === 'card' || paymentMethod === 'mixed' ? cardAmount : 0,
      customer_name: customerName,
      customer_phone: customerPhone,
      invoice_number: invoiceNumber,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    try {
      printInvoice(saleData as any, {
        name: storeInfo.name,
        address: storeInfo.address || '',
        phone: storeInfo.phone || '',
        vatNumber: storeInfo.vat_number || '',
        logo: storeInfo.logo_url || null,
        website: storeInfo.email || '',
        footer: 'شكراً لزيارتكم!',
        fontSize: 'medium',
        showVat: !!storeInfo.vat_number,
        notes: '',
        paymentInstructions: '',
        logoChoice: 'store',
        customLogoUrl: null,
      });
    } catch (error) {
      console.error("Error printing invoice:", error);
      toast({
        title: "Error",
        description: "Failed to print invoice.",
        variant: "destructive",
      });
    } finally {
      setIsPrinting(false);
    }
  };

  const handleBarcodeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBarcodeInputValue(e.target.value);
  };

  const handleBarcodeSubmit = () => {
    if (barcodeInputValue) {
      handleBarcodeSearch(barcodeInputValue);
      setIsBarcodeModalOpen(false);
      setBarcodeInputValue("");
    }
  };

  const handleWeightInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setWeightInputValue(e.target.value);
  };

  const handleWeightSubmit = () => {
    if (weightInputValue && selectedWeightItem) {
      const weight = parseFloat(weightInputValue);
      if (!isNaN(weight)) {
        const index = cart.findIndex(item => item.product.id === selectedWeightItem.product.id);
        if (index >= 0) {
          handleWeightChange(index, weight);
        }
        setIsWeightModalOpen(false);
        setWeightInputValue("");
        setSelectedWeightItem(null);
      } else {
        toast({
          title: "Error",
          description: "Please enter a valid weight.",
          variant: "destructive",
        });
      }
    }
  };

  return (
    <MainLayout>
      <div className="container mx-auto p-6 dir-rtl">
        <h1 className="text-2xl font-bold mb-4">نظام نقاط البيع</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Product Selection */}
          <div className="md:col-span-2">
            <div className="mb-4 flex items-center">
              <div className="relative w-full">
                <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="ابحث عن المنتجات..."
                  className="pl-10 pr-10"
                  value={searchQuery}
                  onChange={handleSearch}
                />
              </div>
              <Button
                variant="outline"
                className="ml-2"
                onClick={() => {
                  setIsBarcodeModalOpen(true);
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="lucide lucide-barcode"
                >
                  <path d="M3 7V5a2 2 0 0 1 2-2h2" />
                  <path d="M17 3h2a2 2 0 0 1 2 2v2" />
                  <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
                  <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
                  <path d="M7 10v4" />
                  <path d="M10 10v4" />
                  <path d="M14 10v4" />
                  <path d="M17 10v4" />
                </svg>
              </Button>
            </div>

            <ScrollArea className="h-[400px] rounded-md border">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4">
                {filteredProducts.map((product) => (
                  <div
                    key={product.id}
                    className="border rounded-md p-3 cursor-pointer hover:shadow-md transition-shadow duration-200"
                    onClick={() => handleAddToCart(product)}
                  >
                    <img
                      src={product.image_urls && product.image_urls.length > 0 ? product.image_urls[0] : "/placeholder.svg"}
                      alt={product.name}
                      className="w-full h-32 object-cover rounded-md mb-2"
                    />
                    <h3 className="text-sm font-medium">{product.name}</h3>
                    <p className="text-gray-500 text-xs">
                      {formatCurrency(product.is_offer && product.offer_price ? product.offer_price : product.price)}
                    </p>
                    {product.quantity !== undefined && (
                      <Badge variant={product.quantity <= 5 ? "destructive" : "secondary"} className="w-fit mt-2">
                        المخزون: {product.quantity}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Cart and Payment */}
          <div>
            <Card>
              <CardContent className="p-4">
                <h2 className="text-lg font-semibold mb-4">السلة</h2>
                <ScrollArea className="h-[300px] rounded-md border mb-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">المنتج</TableHead>
                        <TableHead className="text-center">الكمية</TableHead>
                        <TableHead className="text-center">السعر</TableHead>
                        <TableHead className="text-center">المجموع</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cart.map((item, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">{item.product.name}</TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleQuantityChange(index, item.quantity - 1)}
                              >
                                <Minus className="h-4 w-4" />
                              </Button>
                              <span>{item.quantity}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleQuantityChange(index, item.quantity + 1)}
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">{formatCurrency(item.price)}</TableCell>
                          <TableCell className="text-center">{formatCurrency(item.total)}</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveFromCart(index)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>

                <div className="mb-4">
                  <Label htmlFor="discount">الخصم</Label>
                  <Input
                    type="number"
                    id="discount"
                    value={discount.toString()}
                    onChange={handleDiscountChange}
                  />
                </div>

                <div className="mb-4">
                  <Label htmlFor="customerName">اسم العميل</Label>
                  <Input
                    type="text"
                    id="customerName"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                  />
                </div>

                <div className="mb-4">
                  <Label htmlFor="customerPhone">رقم هاتف العميل</Label>
                  <Input
                    type="text"
                    id="customerPhone"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                  />
                </div>

                <div className="mb-4">
                  <Label>طريقة الدفع</Label>
                  <div className="flex gap-2">
                    <Button
                      variant={paymentMethod === 'cash' ? 'default' : 'outline'}
                      onClick={() => handlePaymentMethodChange('cash')}
                    >
                      نقدي
                    </Button>
                    <Button
                      variant={paymentMethod === 'card' ? 'default' : 'outline'}
                      onClick={() => handlePaymentMethodChange('card')}
                    >
                      بطاقة
                    </Button>
                    <Button
                      variant={paymentMethod === 'mixed' ? 'default' : 'outline'}
                      onClick={() => handlePaymentMethodChange('mixed')}
                    >
                      مختلط
                    </Button>
                  </div>
                </div>

                {paymentMethod === 'mixed' && (
                  <div className="mb-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div>
                        <Label htmlFor="cashAmount">المبلغ النقدي</Label>
                        <Input
                          type="number"
                          id="cashAmount"
                          value={cashAmount.toString()}
                          onChange={handleCashAmountChange}
                        />
                      </div>
                      <div>
                        <Label htmlFor="cardAmount">مبلغ البطاقة</Label>
                        <Input
                          type="number"
                          id="cardAmount"
                          value={cardAmount.toString()}
                          onChange={handleCardAmountChange}
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="mb-4">
                  <Label>التاريخ</Label>
                  <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant={"outline"}
                        className={cn(
                          "w-[240px] justify-start text-left font-normal",
                          !date && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {date ? format(date, "PPP", { locale: enUS }) : <span>اختر تاريخ</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                      <Calendar
                        mode="single"
                        selected={date}
                        onSelect={setDate}
                        disabled={(date) =>
                          date > addDays(new Date(), 0)
                        }
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="mb-4">
                  <div className="flex justify-between">
                    <h3 className="text-lg font-semibold">المجموع الكلي</h3>
                    <h3 className="text-lg font-semibold">{formatCurrency(total)}</h3>
                  </div>
                </div>

                <Button
                  className="w-full"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "جاري المعالجة..." : "تسجيل البيع"}
                </Button>

                <Button
                  variant="secondary"
                  className="w-full mt-2"
                  onClick={handlePrintInvoice}
                  disabled={isPrinting}
                >
                  {isPrinting ? "جاري الطباعة..." : "طباعة الفاتورة"}
                </Button>

                <Button
                  variant="destructive"
                  className="w-full mt-2"
                  onClick={resetCart}
                  disabled={isResetting}
                >
                  {isResetting ? "جاري إعادة التعيين..." : "إعادة تعيين السلة"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Bulk Select Modal */}
      <Dialog open={bulkSelectModalOpen} onOpenChange={setBulkSelectModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>اختر نوع المنتج</DialogTitle>
            <DialogDescription>
              هل تريد إضافة المنتج كوحدة عادية أم بالجملة؟
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Button
              className="w-full"
              onClick={() => {
                if (selectedProduct) {
                  addRegularItemToCart(selectedProduct);
                  setBulkSelectModalOpen(false);
                }
              }}
            >
              وحدة عادية
            </Button>
            {selectedProduct?.bulk_enabled && (
              <Button
                className="w-full"
                onClick={() => {
                  if (selectedProduct) {
                    addBulkItemToCart(selectedProduct, true);
                    setBulkSelectModalOpen(false);
                  }
                }}
              >
                وحدة بالجملة
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Barcode Modal */}
      <Dialog open={isBarcodeModalOpen} onOpenChange={setIsBarcodeModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>أدخل الباركود</DialogTitle>
            <DialogDescription>
              أدخل الباركود الخاص بالمنتج لإضافته إلى السلة.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Input
              type="text"
              placeholder="أدخل الباركود"
              value={barcodeInputValue}
              onChange={handleBarcodeInputChange}
            />
            <Button className="w-full" onClick={handleBarcodeSubmit}>
              إضافة المنتج
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Weight Modal */}
      <Dialog open={isWeightModalOpen} onOpenChange={setIsWeightModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>أدخل الوزن</DialogTitle>
            <DialogDescription>
              أدخل وزن المنتج لإضافته إلى السلة.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Input
              type="number"
              placeholder="أدخل الوزن"
              value={weightInputValue}
              onChange={handleWeightInputChange}
            />
            <Button className="w-full" onClick={handleWeightSubmit}>
              إضافة المنتج
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
