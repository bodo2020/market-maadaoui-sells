import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, Plus, Trash2, Save, ShoppingCart, FileText, BadgeDollarSign } from "lucide-react";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { fetchSuppliers } from "@/services/supabase/supplierService";
import { fetchProducts } from "@/services/supabase/productService";
import { createPurchase } from "@/services/supabase/purchaseService";
import { Product, Supplier, CartItem } from "@/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export default function SupplierPurchases() {
  const queryClient = useQueryClient();
  
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("");
  const [selectedSupplierName, setSelectedSupplierName] = useState<string>("");
  const [selectedSupplierBalance, setSelectedSupplierBalance] = useState<number | null>(null);
  
  const [cart, setCart] = useState<CartItem[]>([]);
  const [subtotal, setSubtotal] = useState<number>(0);
  const [paid, setPaid] = useState<number>(0);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState("");
  
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: fetchSuppliers
  });
  
  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: fetchProducts
  });
  
  const createPurchaseMutation = useMutation({
    mutationFn: createPurchase,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success("تم إضافة فاتورة الشراء بنجاح");
      resetPurchase();
    },
    onError: (error) => {
      toast.error("حدث خطأ أثناء إضافة فاتورة الشراء");
      console.error("Error creating purchase:", error);
    }
  });
  
  useEffect(() => {
    if (searchTerm.trim() === "") {
      setFilteredProducts([]);
      return;
    }
    
    const filtered = products.filter(product => 
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.barcode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.description?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    setFilteredProducts(filtered);
  }, [searchTerm, products]);
  
  useEffect(() => {
    const total = cart.reduce((sum, item) => sum + item.total, 0);
    setSubtotal(total);
  }, [cart]);
  
  const handleSupplierSelect = (supplierId: string) => {
    setSelectedSupplierId(supplierId);
    const supplier = suppliers.find(s => s.id === supplierId);
    setSelectedSupplierName(supplier?.name || "");
    setSelectedSupplierBalance(supplier?.balance || null);
  };
  
  const addProductToCart = (product: Product) => {
    const existingItemIndex = cart.findIndex(item => item.product.id === product.id);
    
    if (existingItemIndex >= 0) {
      const updatedCart = [...cart];
      const item = updatedCart[existingItemIndex];
      item.quantity += 1;
      item.total = item.price * item.quantity;
      setCart(updatedCart);
    } else {
      const newItem: CartItem = {
        product: product,
        quantity: 1,
        price: product.purchase_price,
        discount: 0,
        total: product.purchase_price
      };
      
      setCart([...cart, newItem]);
    }
    
    setSearchTerm("");
    setFilteredProducts([]);
  };
  
  const updateItemQuantity = (index: number, quantity: number) => {
    if (quantity <= 0) return;
    
    const updatedCart = [...cart];
    updatedCart[index].quantity = quantity;
    updatedCart[index].total = updatedCart[index].price * quantity;
    setCart(updatedCart);
  };
  
  const updateItemPrice = (index: number, price: number) => {
    if (price < 0) return;
    
    const updatedCart = [...cart];
    updatedCart[index].price = price;
    updatedCart[index].total = price * updatedCart[index].quantity;
    setCart(updatedCart);
  };
  
  const removeFromCart = (index: number) => {
    const updatedCart = [...cart];
    updatedCart.splice(index, 1);
    setCart(updatedCart);
  };
  
  const savePurchase = () => {
    if (!selectedSupplierId) {
      toast.error("الرجاء اختيار مورد");
      return;
    }
    
    if (cart.length === 0) {
      toast.error("لا يوجد منتجات في السلة");
      return;
    }
    
    setIsConfirmDialogOpen(true);
  };
  
  const confirmPurchase = () => {
    const purchaseData = {
      supplier_id: selectedSupplierId,
      invoice_number: invoiceNumber,
      date: invoiceDate,
      total: subtotal,
      paid: paid,
      description: description,
      items: cart.map(item => ({
        product_id: item.product.id,
        quantity: item.quantity,
        price: item.price,
        total: item.total
      }))
    };
    
    createPurchaseMutation.mutate(purchaseData);
    setIsConfirmDialogOpen(false);
  };
  
  const resetPurchase = () => {
    setCart([]);
    setSubtotal(0);
    setPaid(0);
    setSelectedSupplierId("");
    setSelectedSupplierName("");
    setSelectedSupplierBalance(null);
    setInvoiceNumber("");
    setInvoiceDate(new Date().toISOString().split('T')[0]);
    setDescription("");
  };

  const formatBalance = (balance: number | null) => {
    if (balance === null) return "0.00";
    return balance.toFixed(2);
  };

  const getBalanceStatus = (balance: number | null) => {
    if (!balance) return "neutral";
    if (balance > 0) return "negative"; // Business owes money to supplier
    if (balance < 0) return "positive"; // Supplier owes money to business
    return "neutral";
  };
  
  return (
    <MainLayout>
      <div className="flex flex-col space-y-4">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">شراء منتجات من موردين</h1>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>اختيار المورد</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <Select 
                    value={selectedSupplierId} 
                    onValueChange={handleSupplierSelect}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="اختر المورد" />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map((supplier) => (
                        <SelectItem key={supplier.id} value={supplier.id}>
                          {supplier.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {selectedSupplierId && selectedSupplierBalance !== null && (
                    <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-md">
                      <BadgeDollarSign className="h-5 w-5 text-primary" />
                      <span className="font-semibold">الرصيد:</span>
                      
                      {getBalanceStatus(selectedSupplierBalance) === "negative" && (
                        <Badge variant="destructive" className="mr-auto">
                          مدين بـ {formatBalance(selectedSupplierBalance)}
                        </Badge>
                      )}
                      
                      {getBalanceStatus(selectedSupplierBalance) === "positive" && (
                        <Badge variant="default" className="mr-auto bg-green-600">
                          دائن بـ {formatBalance(Math.abs(selectedSupplierBalance || 0))}
                        </Badge>
                      )}
                      
                      {getBalanceStatus(selectedSupplierBalance) === "neutral" && (
                        <Badge variant="outline" className="mr-auto">
                          متعادل {formatBalance(selectedSupplierBalance)}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>بحث عن منتج</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Input
                    placeholder="ابحث باسم المنتج أو الباركود"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  <Button variant="outline">
                    <Search className="ml-2 h-4 w-4" />
                    بحث
                  </Button>
                </div>
                
                {filteredProducts.length > 0 && (
                  <div className="mt-4 border rounded-md overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>المنتج</TableHead>
                          <TableHead>السعر</TableHead>
                          <TableHead>الإجراء</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredProducts.map((product) => (
                          <TableRow key={product.id}>
                            <TableCell>{product.name}</TableCell>
                            <TableCell>{product.purchase_price}</TableCell>
                            <TableCell>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => addProductToCart(product)}
                              >
                                <Plus className="h-4 w-4" />
                                إضافة
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>تفاصيل الفاتورة</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label htmlFor="invoice-number" className="text-sm font-medium">
                      رقم الفاتورة
                    </label>
                    <Input
                      id="invoice-number"
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                      placeholder="ترك فارغًا للتوليد التلقائي"
                    />
                    <div className="text-xs text-muted-foreground">
                      اترك هذا الحقل فارغًا لتوليد رقم فاتورة تلقائيًا
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <label htmlFor="invoice-date" className="text-sm font-medium">
                      تاريخ الفاتورة
                    </label>
                    <Input
                      id="invoice-date"
                      type="date"
                      value={invoiceDate}
                      onChange={(e) => setInvoiceDate(e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-2 md:col-span-2">
                    <label htmlFor="description" className="text-sm font-medium">
                      الوصف
                    </label>
                    <Textarea
                      id="description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="وصف الفاتورة (اختياري)"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex justify-between items-center">
                  <span>سلة الشراء</span>
                  {selectedSupplierName && (
                    <span className="text-sm font-normal">
                      المورد: {selectedSupplierName}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {cart.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <ShoppingCart className="mx-auto h-12 w-12 opacity-20 mb-2" />
                    <p>السلة فارغة</p>
                    <p className="text-sm">قم بالبحث عن منتجات لإضافتها</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="border rounded-md overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>المنتج</TableHead>
                            <TableHead>الكمية</TableHead>
                            <TableHead>السعر</TableHead>
                            <TableHead>المجموع</TableHead>
                            <TableHead></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {cart.map((item, index) => (
                            <TableRow key={index}>
                              <TableCell className="font-medium">
                                {item.product.name}
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  value={item.quantity}
                                  onChange={(e) => updateItemQuantity(index, parseInt(e.target.value))}
                                  min="1"
                                  className="w-16 h-8 p-1 text-center"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  value={item.price}
                                  onChange={(e) => updateItemPrice(index, parseFloat(e.target.value))}
                                  min="0"
                                  className="w-20 h-8 p-1 text-center"
                                />
                              </TableCell>
                              <TableCell>{item.total.toFixed(2)}</TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeFromCart(index)}
                                >
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    
                    <div className="space-y-2 border-t pt-4">
                      <div className="flex justify-between items-center">
                        <span>المجموع:</span>
                        <span className="font-bold">{subtotal.toFixed(2)}</span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <span>المبلغ المدفوع:</span>
                        <Input
                          type="number"
                          value={paid}
                          onChange={(e) => setPaid(parseFloat(e.target.value) || 0)}
                          min="0"
                          className="w-28 h-8 p-1 text-center"
                        />
                      </div>
                      
                      <div className="flex justify-between items-center text-primary">
                        <span>المبلغ المتبقي:</span>
                        <span className="font-bold">{(subtotal - paid).toFixed(2)}</span>
                      </div>
                    </div>
                    
                    <div className="flex justify-between pt-4">
                      <Button variant="outline" onClick={resetPurchase}>
                        مسح السلة
                      </Button>
                      <Button onClick={savePurchase}>
                        <Save className="ml-2 h-4 w-4" />
                        حفظ الفاتورة
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      
      <Dialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تأكيد الشراء</DialogTitle>
            <DialogDescription>
              سيتم إنشاء فاتورة شراء وتحديث رصيد المورد ومخزون المنتجات
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>المورد:</span>
                <span>{selectedSupplierName}</span>
              </div>
              {invoiceNumber && (
                <div className="flex justify-between">
                  <span>رقم الفاتورة:</span>
                  <span>{invoiceNumber}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>المجموع:</span>
                <span>{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>المبلغ المدفوع:</span>
                <span>{paid.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>المبلغ المتبقي:</span>
                <span>{(subtotal - paid).toFixed(2)}</span>
              </div>
            </div>
            
            {selectedSupplierBalance !== null && (subtotal - paid) !== 0 && (
              <div className="p-3 bg-gray-50 rounded-md">
                <div className="flex justify-between">
                  <span>الرصيد الحالي:</span>
                  <span>{formatBalance(selectedSupplierBalance)}</span>
                </div>
                <div className="flex justify-between">
                  <span>الرصيد بعد الشراء:</span>
                  <span>{formatBalance((selectedSupplierBalance || 0) + (subtotal - paid))}</span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConfirmDialogOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={confirmPurchase}>
              <FileText className="ml-2 h-4 w-4" />
              تأكيد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
