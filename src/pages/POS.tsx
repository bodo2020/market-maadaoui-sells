
import { useState, useEffect } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { siteConfig } from "@/config/site";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Search, Barcode, ShoppingCart, Plus, Minus, Trash2, CreditCard, Tag, Receipt, Scale, Box
} from "lucide-react";
import { CartItem, Product } from "@/types";
import { useToast } from "@/hooks/use-toast";

// Demo products
const demoProducts: Product[] = [
  {
    id: "1",
    name: "سكر 1 كيلو",
    barcode: "6221031954818",
    imageUrls: ["/placeholder.svg"],
    quantity: 100,
    price: 45,
    purchasePrice: 40,
    isOffer: false,
    categoryId: "1",
    isBulk: false,
    barcode_type: "normal",
    bulk_enabled: false,
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    id: "2",
    name: "زيت عباد الشمس 1 لتر",
    barcode: "6221031951255",
    imageUrls: ["/placeholder.svg"],
    quantity: 50,
    price: 60,
    purchasePrice: 52,
    isOffer: true,
    offerPrice: 55,
    categoryId: "1",
    isBulk: false,
    barcode_type: "normal",
    bulk_enabled: false,
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    id: "3",
    name: "أرز مصري 5 كيلو",
    barcode: "6221031953392",
    imageUrls: ["/placeholder.svg"],
    quantity: 30,
    price: 180,
    purchasePrice: 160,
    isOffer: false,
    categoryId: "1",
    isBulk: true,
    barcode_type: "normal",
    bulk_enabled: true,
    bulk_quantity: 5,
    bulk_price: 850,
    bulk_barcode: "6221031953393",
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    id: "4",
    name: "شاي ليبتون 100 كيس",
    barcode: "6221031958762",
    imageUrls: ["/placeholder.svg"],
    quantity: 45,
    price: 120,
    purchasePrice: 110,
    isOffer: true,
    offerPrice: 115,
    categoryId: "2",
    isBulk: false,
    barcode_type: "normal",
    bulk_enabled: false,
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    id: "5",
    name: "تفاح أحمر",
    barcode: "2000123456789",
    imageUrls: ["/placeholder.svg"],
    quantity: 80,
    price: 35,
    purchasePrice: 30,
    isOffer: false,
    categoryId: "1",
    isBulk: false,
    barcode_type: "scale",
    bulk_enabled: false,
    created_at: new Date(),
    updated_at: new Date()
  }
];

export default function POS() {
  const [search, setSearch] = useState("");
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [weightInput, setWeightInput] = useState<string>("");
  const [showWeightDialog, setShowWeightDialog] = useState(false);
  const [currentScaleProduct, setCurrentScaleProduct] = useState<Product | null>(null);
  const { toast } = useToast();
  
  const handleSearch = () => {
    if (!search) return;
    
    // Check if it's a bulk barcode
    const bulkProduct = demoProducts.find(p => p.bulk_enabled && p.bulk_barcode === search);
    if (bulkProduct) {
      handleAddBulkToCart(bulkProduct);
      setSearch("");
      return;
    }
    
    // Check if it's a scale barcode (starts with 2)
    if (search.startsWith("2")) {
      const scaleProduct = demoProducts.find(p => 
        p.barcode_type === "scale" && 
        search.substring(0, 7) === p.barcode.substring(0, 7)
      );
      
      if (scaleProduct) {
        // Extract weight from barcode (assume format 2PPPPPWWWWWC)
        // where P is product code, W is weight in grams, C is check digit
        const weightInGrams = parseFloat(search.substring(7, 12)) / 1000;
        handleAddScaleProductToCart(scaleProduct, weightInGrams);
        setSearch("");
        return;
      }
    }
    
    // Regular search
    const results = demoProducts.filter(
      product => 
        product.barcode === search || 
        product.name.includes(search)
    );
    
    setSearchResults(results);
    
    // If we found exact barcode match for a regular product, add to cart
    const exactMatch = demoProducts.find(p => 
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
              total: (item.quantity + 1) * (product.isOffer && product.offerPrice ? product.offerPrice : product.price) 
            } 
          : item
      ));
    } else {
      // Add new item
      const price = product.isOffer && product.offerPrice ? product.offerPrice : product.price;
      setCartItems([
        ...cartItems, 
        { 
          product, 
          quantity: 1, 
          price,
          discount: product.isOffer && product.offerPrice ? product.price - product.offerPrice : 0,
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
    const discountPerKg = product.isOffer && product.offerPrice ? product.price - product.offerPrice : 0;
    
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
                              src={product.imageUrls[0]} 
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
                              ) : product.isOffer && product.offerPrice ? (
                                <>
                                  <span className="text-primary">{product.offerPrice}</span>
                                  <span className="mr-1 text-xs text-muted-foreground line-through">{product.price}</span>
                                </>
                              ) : (
                                <span>{product.price}</span>
                              )}
                              <span className="mr-1 text-xs">{siteConfig.currency}</span>
                            </p>
                            {product.isOffer && (
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
                
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {demoProducts.slice(0, 8).map(product => (
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
                            src={product.imageUrls[0]} 
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
                            ) : product.isOffer && product.offerPrice ? (
                              <>
                                <span className="text-primary">{product.offerPrice}</span>
                                <span className="mr-1 text-xs text-muted-foreground line-through">{product.price}</span>
                              </>
                            ) : (
                              <span>{product.price}</span>
                            )}
                            <span className="mr-1 text-xs">{siteConfig.currency}</span>
                          </p>
                          {product.isOffer && (
                            <Tag className="h-4 w-4 text-primary" />
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
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
                                  {item.product.isOffer && item.product.offerPrice ? item.product.offerPrice : item.product.price} {siteConfig.currency}
                                  {item.product.isOffer && item.product.offerPrice && (
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
    </MainLayout>
  );
}
