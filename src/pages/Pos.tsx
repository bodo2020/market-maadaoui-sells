
import { useState, useEffect } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { siteConfig } from "@/config/site";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Search, Barcode, ShoppingCart, Plus, Minus, Trash2, CreditCard, Tag, Receipt, Scale, Box, 
  CreditCard as CardIcon, Banknote, Check, X 
} from "lucide-react";
import { CartItem, Product, Sale } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { fetchProducts, fetchProductByBarcode } from "@/services/supabase/productService";
import { createSale, generateInvoiceNumber } from "@/services/supabase/saleService";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

export default function Pos() {
  const [search, setSearch] = useState("");
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [weightInput, setWeightInput] = useState<string>("");
  const [showWeightDialog, setShowWeightDialog] = useState(false);
  const [currentScaleProduct, setCurrentScaleProduct] = useState<Product | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
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
  const { toast } = useToast();

  useEffect(() => {
    const loadProducts = async () => {
      try {
        setIsLoading(true);
        const data = await fetchProducts();
        setProducts(data);
      } catch (error) {
        console.error("Error loading products:", error);
        toast({
          title: "خطأ في تحميل المنتجات",
          description: "حدث خطأ أثناء تحميل المنتجات، يرجى المحاولة مرة أخرى.",
          variant: "destructive"
        });
      } finally {
        setIsLoading(false);
      }
    };
    
    loadProducts();
  }, [toast]);
  
  const handleSearch = async () => {
    if (!search) return;
    
    // Check if it's a bulk barcode
    const bulkProduct = products.find(p => p.bulk_enabled && p.bulk_barcode === search);
    if (bulkProduct) {
      handleAddBulkToCart(bulkProduct);
      setSearch("");
      return;
    }
    
    // Check if it's a scale barcode (starts with 2 and has 13 digits)
    if (search.startsWith("2") && search.length === 13) {
      // First try direct lookup through API
      try {
        const product = await fetchProductByBarcode(search);
        if (product) {
          // If the product has calculated_weight property, it was processed by the backend
          if (product.calculated_weight) {
            handleAddScaleProductToCart(product, product.calculated_weight);
            setSearch("");
            return;
          }
        }
      } catch (error) {
        console.error("Error fetching product by scale barcode:", error);
      }
      
      // As a fallback, process locally if API didn't handle it
      // Extract the product code (digits 2-7)
      const productCode = search.substring(1, 7);
      
      // Find the product with this code
      const scaleProduct = products.find(p => 
        p.barcode_type === "scale" && 
        p.barcode === productCode
      );
      
      if (scaleProduct) {
        // Extract weight from barcode (digits 8-12)
        // Format is 2PPPPPWWWWWC where:
        // P is product code (6 digits)
        // W is weight in grams (5 digits)
        // C is check digit
        const weightInGrams = parseInt(search.substring(7, 12));
        const weightInKg = weightInGrams / 1000;
        
        handleAddScaleProductToCart(scaleProduct, weightInKg);
        setSearch("");
        return;
      }
    }
    
    // Try to fetch directly from backend first
    try {
      const product = await fetchProductByBarcode(search);
      if (product) {
        handleAddToCart(product);
        setSearch("");
        return;
      }
    } catch (error) {
      console.error("Error fetching product by barcode:", error);
    }
    
    // Regular search if direct lookup failed
    const results = products.filter(
      product => 
        product.barcode === search || 
        product.name.includes(search)
    );
    
    setSearchResults(results);
    
    // If we found exact barcode match for a regular product, add to cart
    const exactMatch = products.find(p => 
      p.barcode === search && 
      p.barcode_type === "normal" && 
      !p.bulk_enabled
    );
    
    if (exactMatch) {
      handleAddToCart(exactMatch);
      setSearch("");
    } else if (results.length === 1 && results[0].barcode_type === "scale") {
      // If we found a single scale product, prompt for weight
      setCurrentScaleProduct(results[0]);
      setShowWeightDialog(true);
      setSearch("");
    }
  };
  
  const handleAddToCart = (product: Product) => {
    const existingItem = cartItems.find(item => item.product.id === product.id);
    
    if (existingItem) {
      // Update existing item quantity
      setCartItems(cartItems.map(item => 
        item.product.id === product.id 
          ? { 
              ...item, 
              quantity: item.quantity + 1,
              total: (item.quantity + 1) * (product.is_offer && product.offer_price ? product.offer_price : product.price) 
            } 
          : item
      ));
    } else {
      // Add new item
      const price = product.is_offer && product.offer_price ? product.offer_price : product.price;
      setCartItems([
        ...cartItems, 
        { 
          product, 
          quantity: 1, 
          price,
          discount: product.is_offer && product.offer_price ? product.price - product.offer_price : 0,
          total: price,
          weight: null
        }
      ]);
    }
    
    setSearchResults([]);
  };
  
  const handleAddScaleProductToCart = (product: Product, weight: number) => {
    // Calculate price based on weight (kg) and per kg price
    const itemPrice = product.price * weight;
    const discountPerKg = product.is_offer && product.offer_price ? product.price - product.offer_price : 0;
    
    // Add as new item always (since weight might be different)
    setCartItems([
      ...cartItems, 
      { 
        product, 
        quantity: 1, 
        price: itemPrice,
        discount: discountPerKg * weight,
        total: itemPrice,
        weight: weight
      }
    ]);
    
    toast({
      title: "تم إضافة منتج بالوزن",
      description: `${product.name} - ${weight} كجم`,
    });
    
    setSearchResults([]);
    setShowWeightDialog(false);
    setCurrentScaleProduct(null);
    setWeightInput("");
  };
  
  const handleAddBulkToCart = (product: Product) => {
    if (!product.bulk_enabled || !product.bulk_quantity || !product.bulk_price) {
      toast({
        title: "خطأ",
        description: "تفاصيل الجملة غير كاملة لهذا المنتج",
        variant: "destructive"
      });
      return;
    }
    
    // For bulk items, add the bulk quantity to cart
    setCartItems([
      ...cartItems, 
      { 
        product, 
        quantity: product.bulk_quantity,
        price: product.bulk_price / product.bulk_quantity,
        discount: 0,
        total: product.bulk_price,
        isBulk: true
      }
    ]);
    
    toast({
      title: "تم إضافة عبوة جملة",
      description: `${product.name} - ${product.bulk_quantity} وحدة`,
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
        // Don't allow changing quantity for scale products
        if (item.weight !== null && change > 0) return item;
        
        const newQuantity = Math.max(1, item.quantity + change);
        let price = item.price;
        
        // Recalculate total
        let total = item.weight !== null 
          ? item.price // For scale items, price is already calculated based on weight
          : newQuantity * price;
        
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
    setIsCheckoutOpen(true);
    
    // Set default cash amount to total
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
      // For mixed, we'll leave both fields available
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
      // For mixed payment
      const cashAmountNum = parseFloat(cashAmount || "0");
      const cardAmountNum = parseFloat(cardAmount || "0");
      return (cashAmountNum + cardAmountNum) === total;
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
      const invoiceNumber = await generateInvoiceNumber();
      setCurrentInvoiceNumber(invoiceNumber);
      
      // Calculate total profit
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
        invoice_number: invoiceNumber
      };
      
      const sale = await createSale(saleData);
      
      toast({
        title: "تم إتمام البيع بنجاح",
        description: `رقم الفاتورة: ${sale.invoice_number}`,
      });
      
      setShowSuccess(true);
      
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
    setIsCheckoutOpen(false);
    setShowSuccess(false);
    setIsProcessing(false);
    setPaymentMethod('cash');
    setCashAmount("");
    setCardAmount("");
    setCustomerName("");
    setCustomerPhone("");
    setCurrentInvoiceNumber("");
  };
  
  const subtotal = cartItems.reduce((sum, item) => sum + item.total, 0);
  const discount = cartItems.reduce((sum, item) => sum + (item.discount * item.quantity), 0);
  const total = subtotal;
  
  return (
    <MainLayout>
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
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Products Search Section */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>بحث المنتجات</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-4">
                <Input 
                  placeholder="ابحث بالباركود أو اسم المنتج" 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSearch();
                  }}
                  className="flex-1"
                />
                <Button onClick={handleSearch}>
                  <Search className="ml-2 h-4 w-4" />
                  بحث
                </Button>
                <Button variant="outline">
                  <Barcode className="ml-2 h-4 w-4" />
                  مسح
                </Button>
              </div>
              
              {/* Weight Input Dialog */}
              {showWeightDialog && currentScaleProduct && (
                <div className="border rounded-lg p-4 mb-4 bg-muted/10">
                  <div className="flex items-center mb-3">
                    <Scale className="h-5 w-5 ml-2 text-primary" />
                    <h3 className="font-semibold">إدخال الوزن - {currentScaleProduct.name}</h3>
                  </div>
                  
                  <div className="flex gap-2">
                    <Input 
                      placeholder="أدخل الوزن بالكيلوجرام" 
                      type="number" 
                      step="0.001"
                      value={weightInput}
                      onChange={(e) => setWeightInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleWeightSubmit();
                      }}
                      className="flex-1"
                    />
                    <span className="flex items-center ml-2 text-sm text-muted-foreground">كجم</span>
                    <Button onClick={handleWeightSubmit}>إضافة</Button>
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        setShowWeightDialog(false);
                        setCurrentScaleProduct(null);
                        setWeightInput("");
                      }}
                    >
                      إلغاء
                    </Button>
                  </div>
                </div>
              )}
              
              {searchResults.length > 0 && (
                <div className="border rounded-lg p-4 space-y-4">
                  <h3 className="font-semibold">نتائج البحث</h3>
                  
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {searchResults.map(product => (
                      <Card 
                        key={product.id} 
                        className="cursor-pointer hover:bg-gray-50 transition-colors"
                        onClick={() => {
                          if (product.barcode_type === "scale") {
                            setCurrentScaleProduct(product);
                            setShowWeightDialog(true);
                          } else if (product.bulk_enabled && product.bulk_barcode) {
                            handleAddBulkToCart(product);
                          } else {
                            handleAddToCart(product);
                          }
                        }}
                      >
                        <CardContent className="p-3">
                          <div className="aspect-square rounded bg-gray-100 flex items-center justify-center mb-2">
                            <img 
                              src={product.image_urls?.[0] || "/placeholder.svg"} 
                              alt={product.name}
                              className="h-16 w-16 object-contain"
                            />
                          </div>
                          <h4 className="text-sm font-medium line-clamp-2">{product.name}</h4>
                          
                          {/* Product icons/badges */}
                          <div className="flex gap-1 my-1">
                            {product.barcode_type === "scale" && (
                              <span className="bg-blue-100 text-blue-800 text-xs rounded px-1.5 py-0.5 flex items-center">
                                <Scale className="h-3 w-3 ml-1" />
                                بالوزن
                              </span>
                            )}
                            {product.bulk_enabled && (
                              <span className="bg-amber-100 text-amber-800 text-xs rounded px-1.5 py-0.5 flex items-center">
                                <Box className="h-3 w-3 ml-1" />
                                جملة
                              </span>
                            )}
                          </div>
                          
                          <div className="flex justify-between items-center mt-2">
                            <p className="text-sm font-bold">
                              {product.barcode_type === "scale" ? (
                                <span>{product.price} / كجم</span>
                              ) : product.is_offer && product.offer_price ? (
                                <>
                                  <span className="text-primary">{product.offer_price}</span>
                                  <span className="mr-1 text-xs text-muted-foreground line-through">{product.price}</span>
                                </>
                              ) : (
                                <span>{product.price}</span>
                              )}
                              <span className="mr-1 text-xs">{siteConfig.currency}</span>
                            </p>
                            {product.is_offer && (
                              <Tag className="h-4 w-4 text-primary" />
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="mt-6">
                <h3 className="font-semibold mb-4">المنتجات المقترحة</h3>
                
                {isLoading ? (
                  <div className="flex justify-center items-center h-40">
                    <p className="text-muted-foreground">جاري تحميل المنتجات...</p>
                  </div>
                ) : products.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <p>لا توجد منتجات متاحة</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {products.slice(0, 8).map(product => (
                      <Card 
                        key={product.id} 
                        className="cursor-pointer hover:bg-gray-50 transition-colors"
                        onClick={() => {
                          if (product.barcode_type === "scale") {
                            setCurrentScaleProduct(product);
                            setShowWeightDialog(true);
                          } else if (product.bulk_enabled && product.bulk_barcode) {
                            handleAddBulkToCart(product);
                          } else {
                            handleAddToCart(product);
                          }
                        }}
                      >
                        <CardContent className="p-3">
                          <div className="aspect-square rounded bg-gray-100 flex items-center justify-center mb-2">
                            <img 
                              src={product.image_urls?.[0] || "/placeholder.svg"} 
                              alt={product.name}
                              className="h-16 w-16 object-contain"
                            />
                          </div>
                          <h4 className="text-sm font-medium line-clamp-2">{product.name}</h4>
                          
                          {/* Product icons/badges */}
                          <div className="flex gap-1 my-1">
                            {product.barcode_type === "scale" && (
                              <span className="bg-blue-100 text-blue-800 text-xs rounded px-1.5 py-0.5 flex items-center">
                                <Scale className="h-3 w-3 ml-1" />
                                بالوزن
                              </span>
                            )}
                            {product.bulk_enabled && (
                              <span className="bg-amber-100 text-amber-800 text-xs rounded px-1.5 py-0.5 flex items-center">
                                <Box className="h-3 w-3 ml-1" />
                                جملة
                              </span>
                            )}
                          </div>
                          
                          <div className="flex justify-between items-center mt-2">
                            <p className="text-sm font-bold">
                              {product.barcode_type === "scale" ? (
                                <span>{product.price} / كجم</span>
                              ) : product.is_offer && product.offer_price ? (
                                <>
                                  <span className="text-primary">{product.offer_price}</span>
                                  <span className="mr-1 text-xs text-muted-foreground line-through">{product.price}</span>
                                </>
                              ) : (
                                <span>{product.price}</span>
                              )}
                              <span className="mr-1 text-xs">{siteConfig.currency}</span>
                            </p>
                            {product.is_offer && (
                              <Tag className="h-4 w-4 text-primary" />
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Cart Section */}
        <div>
          <Card className="sticky top-6">
            <CardHeader className="pb-3">
              <div className="flex justify-between items-center">
                <CardTitle>سلة المشتريات</CardTitle>
                <ShoppingCart className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {cartItems.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <ShoppingCart className="h-10 w-10 mx-auto mb-2 opacity-20" />
                  <p>السلة فارغة</p>
                </div>
              ) : (
                <>
                  <div className="space-y-4 max-h-[400px] overflow-y-auto">
                    {cartItems.map((item, index) => (
                      <div key={index} className="flex flex-col pb-3 border-b">
                        <div className="flex justify-between">
                          <div className="flex-1">
                            <h4 className="font-medium">{item.product.name}</h4>
                            <div className="flex text-sm space-x-1 text-muted-foreground">
                              {item.weight ? (
                                <span className="ml-1">
                                  {item.product.price} {siteConfig.currency}/كجم × {item.weight} كجم
                                </span>
                              ) : item.isBulk ? (
                                <span className="ml-1">
                                  عبوة جملة {item.quantity} وحدة
                                </span>
                              ) : (
                                <span className="ml-1">
                                  {item.product.is_offer && item.product.offer_price ? item.product.offer_price : item.product.price} {siteConfig.currency}
                                  {item.product.is_offer && item.product.offer_price && (
                                    <span className="line-through mr-1">{item.product.price} {siteConfig.currency}</span>
                                  )}
                                </span>
                              )}
                            </div>
                          </div>
                          
                          <div className="text-right">
                            <p className="font-bold">{item.total.toFixed(2)} {siteConfig.currency}</p>
                          </div>
                        </div>
                        
                        <div className="flex justify-between items-center mt-2">
                          {item.weight === null && !item.isBulk ? (
                            <div className="flex items-center space-x-2">
                              <Button 
                                variant="outline" 
                                size="icon" 
                                className="h-7 w-7"
                                onClick={() => handleQuantityChange(index, -1)}
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                              
                              <span className="w-8 text-center">{item.quantity}</span>
                              
                              <Button 
                                variant="outline" 
                                size="icon" 
                                className="h-7 w-7"
                                onClick={() => handleQuantityChange(index, 1)}
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : item.weight ? (
                            <div className="flex items-center">
                              <Scale className="h-4 w-4 text-blue-500 ml-1" />
                              <span className="text-sm">{item.weight} كجم</span>
                            </div>
                          ) : (
                            <div className="flex items-center">
                              <Box className="h-4 w-4 text-amber-500 ml-1" />
                              <span className="text-sm">{item.quantity} وحدة</span>
                            </div>
                          )}
                          
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-7 w-7 text-destructive"
                            onClick={() => handleRemoveFromCart(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <div className="space-y-2 pt-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">المجموع الفرعي</span>
                      <span>{subtotal.toFixed(2)} {siteConfig.currency}</span>
                    </div>
                    {discount > 0 && (
                      <div className="flex justify-between text-primary">
                        <span>الخصم</span>
                        <span>- {discount.toFixed(2)} {siteConfig.currency}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-lg pt-2 border-t">
                      <span>الإجمالي</span>
                      <span>{total.toFixed(2)} {siteConfig.currency}</span>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
            <CardFooter className="flex flex-col space-y-2 pt-0">
              <Button 
                className="w-full" 
                size="lg"
                disabled={cartItems.length === 0}
                onClick={openCheckout}
              >
                <CreditCard className="ml-2 h-4 w-4" />
                إتمام الشراء
              </Button>
              
              <Button 
                variant="outline" 
                className="w-full"
                disabled={cartItems.length === 0}
              >
                <Receipt className="ml-2 h-4 w-4" />
                معاينة الفاتورة
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
      
      {/* Checkout Dialog */}
      <Dialog open={isCheckoutOpen} onOpenChange={setIsCheckoutOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>إتمام عملية البيع</DialogTitle>
          </DialogHeader>
          
          {showSuccess ? (
            <div className="space-y-4 py-4">
              <div className="flex flex-col items-center justify-center space-y-2">
                <div className="rounded-full bg-green-100 p-3">
                  <Check className="h-6 w-6 text-green-600" />
                </div>
                <h3 className="font-semibold text-lg">تمت عملية البيع بنجاح</h3>
                <p className="text-muted-foreground text-center">تم تسجيل عملية البيع بنجاح برقم فاتورة:</p>
                <p className="font-bold text-lg">{currentInvoiceNumber}</p>
              </div>
              
              <Button onClick={resetSale} className="w-full">
                عملية بيع جديدة
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <h3 className="font-semibold">معلومات العميل (اختياري)</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="customerName">اسم العميل</Label>
                      <Input 
                        id="customerName" 
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="customerPhone">رقم الهاتف</Label>
                      <Input 
                        id="customerPhone" 
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <h3 className="font-semibold">طريقة الدفع</h3>
                  <RadioGroup 
                    value={paymentMethod} 
                    onValueChange={(value) => handlePaymentMethodChange(value as 'cash' | 'card' | 'mixed')}
                    className="flex space-x-2 space-x-reverse"
                  >
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
                    {(paymentMethod === 'cash' || paymentMethod === 'mixed') && (
                      <div className="space-y-1">
                        <Label htmlFor="cashAmount" className="flex items-center">
                          <Banknote className="ml-2 h-4 w-4" />
                          المبلغ النقدي
                        </Label>
                        <Input 
                          id="cashAmount"
                          type="number"
                          step="0.01"
                          min="0"
                          value={cashAmount}
                          onChange={(e) => setCashAmount(e.target.value)}
                        />
                      </div>
                    )}
                    
                    {(paymentMethod === 'card' || paymentMethod === 'mixed') && (
                      <div className="space-y-1">
                        <Label htmlFor="cardAmount" className="flex items-center">
                          <CardIcon className="ml-2 h-4 w-4" />
                          المبلغ بالبطاقة
                        </Label>
                        <Input 
                          id="cardAmount"
                          type="number"
                          step="0.01"
                          min="0"
                          value={cardAmount}
                          onChange={(e) => setCardAmount(e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                  
                  {paymentMethod === 'cash' && parseFloat(cashAmount || "0") > total && (
                    <div className="flex justify-between items-center p-2 bg-primary/10 rounded">
                      <span>المبلغ المتبقي:</span>
                      <span className="font-bold">{calculateChange().toFixed(2)} {siteConfig.currency}</span>
                    </div>
                  )}
                  
                  {paymentMethod === 'mixed' && (
                    <div className="flex justify-between items-center p-2 bg-primary/10 rounded">
                      <span>إجمالي المدفوع:</span>
                      <span className="font-bold">
                        {(parseFloat(cashAmount || "0") + parseFloat(cardAmount || "0")).toFixed(2)} {siteConfig.currency}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              
              <DialogFooter>
                <Button
                  onClick={completeSale}
                  disabled={
                    isProcessing || 
                    !validatePayment() ||
                    (paymentMethod === 'mixed' && (
                      parseFloat(cashAmount || "0") + parseFloat(cardAmount || "0") !== total
                    ))
                  }
                  className="w-full"
                >
                  {isProcessing ? (
                    <span className="flex items-center">
                      جاري المعالجة...
                    </span>
                  ) : (
                    <span className="flex items-center">
                      <Check className="ml-2 h-4 w-4" />
                      إتمام البيع
                    </span>
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
