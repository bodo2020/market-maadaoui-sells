import { useState, useEffect } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { siteConfig } from "@/config/site";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { 
  Search, 
  Plus, 
  Pencil, 
  Trash2, 
  Package, 
  ArrowUpDown,
  MoreHorizontal,
  Tag,
  Barcode,
  Box,
  Loader2,
  ScanLine,
  Image as ImageIcon
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Product } from "@/types";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { fetchProducts, createProduct, updateProduct, deleteProduct, fetchProductById } from "@/services/supabase/productService";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button as ShadcnButton } from "@/components/ui/button";
import { Dialog as ShadcnDialog } from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";

export default function ProductManagement() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [newProduct, setNewProduct] = useState<Partial<Product>>({
    barcode_type: "normal",
    bulk_enabled: false,
    is_offer: false,
    image_urls: ["/placeholder.svg"],
    quantity: 0,
  });
  const [isBarcodeDialogOpen, setIsBarcodeDialogOpen] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState("");
  const [scannedWeight, setScannedWeight] = useState("");
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [productToEdit, setProductToEdit] = useState<Product | null>(null);
  const [isOfferDialogOpen, setIsOfferDialogOpen] = useState(false);
  const [productToAddOffer, setProductToAddOffer] = useState<Product | null>(null);
  const { toast } = useToast();
  
  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const data = await fetchProducts();
      setProducts(data);
    } catch (error) {
      console.error("Error loading products:", error);
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء تحميل المنتجات",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
  
  const filteredProducts = products.filter(product => 
    product.name.toLowerCase().includes(search.toLowerCase()) || 
    (product.barcode && product.barcode.includes(search))
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value, type } = e.target;
    
    if (id === "barcode" && newProduct.barcode_type === "scale") {
      const cleanValue = value.replace(/\D/g, '').substring(0, 5);
      setNewProduct({
        ...newProduct,
        [id]: cleanValue
      });
    } else {
      setNewProduct({
        ...newProduct,
        [id]: type === "number" ? Number(value) : value
      });
    }
  };

  const handleEditInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value, type } = e.target;
    
    if (id === "barcode" && productToEdit?.barcode_type === "scale") {
      const cleanValue = value.replace(/\D/g, '').substring(0, 5);
      setProductToEdit({
        ...productToEdit,
        [id]: cleanValue
      } as Product);
    } else {
      setProductToEdit({
        ...productToEdit,
        [id]: type === "number" ? Number(value) : value
      } as Product);
    }
  };

  const handleSelectChange = (value: string, field: string) => {
    setNewProduct({
      ...newProduct,
      [field]: value
    });
  };

  const handleEditSelectChange = (value: string, field: string) => {
    setProductToEdit({
      ...productToEdit,
      [field]: value
    } as Product);
  };

  const handleCheckboxChange = (checked: boolean, field: string) => {
    setNewProduct({
      ...newProduct,
      [field]: checked
    });
  };

  const handleEditCheckboxChange = (checked: boolean, field: string) => {
    setProductToEdit({
      ...productToEdit,
      [field]: checked
    } as Product);
  };

  const handleSaveProduct = async () => {
    if (!newProduct.name || !newProduct.price || !newProduct.purchase_price) {
      toast({
        title: "خطأ",
        description: "يرجى ملء جميع الحقول المطلوبة",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const productToAdd: Omit<Product, "id" | "created_at" | "updated_at"> = {
        name: newProduct.name || "",
        barcode: newProduct.barcode || null,
        description: newProduct.description || null,
        image_urls: newProduct.image_urls || ["/placeholder.svg"],
        quantity: newProduct.quantity || 0,
        price: newProduct.price || 0,
        purchase_price: newProduct.purchase_price || 0,
        is_offer: newProduct.is_offer || false,
        offer_price: newProduct.is_offer ? newProduct.offer_price : null,
        category_id: newProduct.category_id || null,
        subcategory_id: null,
        subsubcategory_id: null,
        barcode_type: newProduct.barcode_type || "normal",
        bulk_enabled: newProduct.bulk_enabled || false,
        bulk_quantity: newProduct.bulk_enabled ? newProduct.bulk_quantity : null,
        bulk_price: newProduct.bulk_enabled ? newProduct.bulk_price : null,
        bulk_barcode: newProduct.bulk_enabled ? newProduct.bulk_barcode : null,
        manufacturer_name: newProduct.manufacturer_name || null,
        unit_of_measure: newProduct.unit_of_measure || null,
        is_bulk: false
      };

      const addedProduct = await createProduct(productToAdd);
      
      setProducts([...products, addedProduct]);
      setNewProduct({
        barcode_type: "normal",
        bulk_enabled: false,
        is_offer: false,
        image_urls: ["/placeholder.svg"],
        quantity: 0,
        is_bulk: false
      });
      setIsAddDialogOpen(false);
      
      toast({
        title: "تم بنجاح",
        description: "تم إضافة المنتج بنجاح",
      });
    } catch (error) {
      console.error("Error adding product:", error);
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء إضافة المنتج",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEditProduct = async () => {
    if (!productToEdit || !productToEdit.name || !productToEdit.price || !productToEdit.purchase_price) {
      toast({
        title: "خطأ",
        description: "يرجى ملء جميع الحقول المطلوبة",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const updatedProduct = await updateProduct(productToEdit.id, productToEdit);
      
      setProducts(products.map(p => p.id === updatedProduct.id ? updatedProduct : p));
      setIsEditDialogOpen(false);
      setProductToEdit(null);
      
      toast({
        title: "تم بنجاح",
        description: "تم تحديث المنتج بنجاح",
      });
    } catch (error) {
      console.error("Error updating product:", error);
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء تحديث المنتج",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProduct = async () => {
    if (!productToDelete) return;
    
    setLoading(true);
    try {
      await deleteProduct(productToDelete.id);
      setProducts(products.filter(p => p.id !== productToDelete.id));
      setIsDeleteConfirmOpen(false);
      setProductToDelete(null);
      
      toast({
        title: "تم بنجاح",
        description: "تم حذف المنتج بنجاح",
      });
    } catch (error) {
      console.error("Error deleting product:", error);
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء حذف المنتج",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddOffer = async () => {
    if (!productToAddOffer || !productToAddOffer.offer_price) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال سعر العرض",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const updatedProduct = await updateProduct(productToAddOffer.id, {
        is_offer: true,
        offer_price: productToAddOffer.offer_price
      });
      
      setProducts(products.map(p => p.id === updatedProduct.id ? updatedProduct : p));
      setIsOfferDialogOpen(false);
      setProductToAddOffer(null);
      
      toast({
        title: "تم بنجاح",
        description: "تم إضافة العرض بنجاح",
      });
    } catch (error) {
      console.error("Error adding offer:", error);
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء إضافة العرض",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBarcodeScanning = () => {
    setIsBarcodeDialogOpen(true);
  };

  const validateWeightBarcode = (barcode: string) => {
    if (!/^\d{1,6}$/.test(barcode)) {
      toast({
        title: "خطأ",
        description: "رمز منتج الميزان يجب أن يكون من 1 إلى 6 أرقام فقط.",
        variant: "destructive"
      });
      return false;
    }

    let formattedBarcode = barcode;
    while (formattedBarcode.length < 6) {
      formattedBarcode = '0' + formattedBarcode;
    }
    
    setNewProduct(prev => ({
      ...prev,
      barcode_type: 'scale',
      barcode: formattedBarcode,
      unit_of_measure: 'كجم'
    }));

    toast({
      title: "تم تعيين رمز المنتج",
      description: `رمز المنتج: ${formattedBarcode}`,
    });

    return true;
  };

  const handleBarcodeSubmit = () => {
    if (scannedBarcode) {
      if (scannedBarcode.startsWith('2') && scannedBarcode.length === 13) {
        const productCode = scannedBarcode.substring(1, 7);
        
        setNewProduct(prev => ({
          ...prev,
          barcode_type: 'scale',
          barcode: productCode,
          unit_of_measure: 'كجم'
        }));
        
        setIsBarcodeDialogOpen(false);
        
        toast({
          title: "تم قراءة باركود الميزان",
          description: `رمز المنتج: ${productCode}`,
        });
      } else {
        setNewProduct(prev => ({
          ...prev,
          barcode_type: 'normal',
          barcode: scannedBarcode,
        }));
        setIsBarcodeDialogOpen(false);
        
        toast({
          title: "تم قراءة الباركود",
          description: `الباركود: ${scannedBarcode}`,
        });
      }
      setScannedBarcode("");
    } else {
      toast({
        title: "خطأ",
        description: "يرجى إدخال الباركود أولاً",
        variant: "destructive"
      });
    }
  };

  const handleEditClick = async (product: Product) => {
    navigate(`/add-product?id=${product.id}`);
  };

  const handleAddOfferClick = (product: Product) => {
    setProductToAddOffer({
      ...product,
      is_offer: true,
      offer_price: product.offer_price || Math.round(product.price * 0.9) // Default to 10% off
    });
    setIsOfferDialogOpen(true);
  };

  return (
    <MainLayout>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">إدارة المنتجات</h1>
        <Button onClick={() => navigate("/add-product")} disabled={loading}>
          <Plus className="ml-2 h-4 w-4" />
          إضافة منتج جديد
        </Button>
      </div>
      
      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>المنتجات</CardTitle>
              <CardDescription>إدارة مخزون وأسعار المنتجات</CardDescription>
            </div>
            <Package className="h-5 w-5 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-6">
            <Input 
              placeholder="ابحث بالاسم أو الباركود" 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <Button variant="outline">
              <Search className="ml-2 h-4 w-4" />
              بحث
            </Button>
          </div>
          
          {loading ? (
            <div className="flex justify-center items-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">صورة</TableHead>
                    <TableHead>
                      <div className="flex items-center">
                        المنتج
                        <ArrowUpDown className="mr-2 h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead>الباركود</TableHead>
                    <TableHead>نوع الباركود</TableHead>
                    <TableHead className="text-left">السعر</TableHead>
                    <TableHead>المخزون</TableHead>
                    <TableHead>بيع بالجملة</TableHead>
                    <TableHead className="text-left">الحالة</TableHead>
                    <TableHead className="text-left">خيارات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        لا توجد منتجات مطابقة للبحث
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredProducts.map(product => (
                      <TableRow key={product.id}>
                        <TableCell>
                          <div className="h-12 w-12 rounded bg-gray-100 flex items-center justify-center">
                            <img 
                              src={product.image_urls ? product.image_urls[0] : "/placeholder.svg"} 
                              alt={product.name}
                              className="h-8 w-8 object-contain"
                            />
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{product.name}</TableCell>
                        <TableCell>{product.barcode}</TableCell>
                        <TableCell>
                          {product.barcode_type === "scale" ? (
                            <span className="px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">ميزان</span>
                          ) : (
                            <span className="px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-800">عادي</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {product.is_offer && product.offer_price ? (
                            <div>
                              <span className="text-primary font-medium">{product.offer_price} {siteConfig.currency}</span>
                              <span className="mr-2 text-xs text-muted-foreground line-through">{product.price} {siteConfig.currency}</span>
                            </div>
                          ) : (
                            <span>{product.price} {siteConfig.currency}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">{product.quantity}</TableCell>
                        <TableCell>
                          {product.bulk_enabled ? (
                            <div className="flex items-center">
                              <Box className="h-4 w-4 text-green-600 mr-1" />
                              <span className="text-xs">
                                {product.bulk_quantity} وحدة - {product.bulk_price} {siteConfig.currency}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">غير متاح</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {(product.quantity || 0) > 10 ? (
                            <span className="px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">متوفر</span>
                          ) : (product.quantity || 0) > 0 ? (
                            <span className="px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-800">مخزون منخفض</span>
                          ) : (
                            <span className="px-2 py-1 rounded-full text-xs bg-red-100 text-red-800">غير متوف��</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>خيارات</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleEditClick(product)}>
                                <Pencil className="ml-2 h-4 w-4" />
                                تعديل
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => {
                                  setProductToDelete(product);
                                  setIsDeleteConfirmOpen(true);
                                }}
                              >
                                <Trash2 className="ml-2 h-4 w-4" />
                                حذف
                              </DropdownMenuItem>
                              {!product.is_offer && (
                                <DropdownMenuItem onClick={() => handleAddOfferClick(product)}>
                                  <Tag className="ml-2 h-4 w-4" />
                                  إضافة عرض
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      
      <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>تأكيد الحذف</DialogTitle>
            <DialogDescription>
              هل أنت متأكد من حذف المنتج؟ هذه العملية لا يمكن التراجع عنها.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {productToDelete && (
              <div className="flex items-center gap-3 p-3 border rounded-md">
                <div className="h-12 w-12 rounded bg-gray-100 flex items-center justify-center">
                  <img 
                    src={productToDelete.image_urls ? productToDelete.image_urls[0] : "/placeholder.svg"} 
                    alt={productToDelete.name}
                    className="h-8 w-8 object-contain"
                  />
                </div>
                <div>
                  <h4 className="font-medium">{productToDelete.name}</h4>
                  <p className="text-sm text-muted-foreground">
                    الباركود: {productToDelete.barcode}
                  </p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setIsDeleteConfirmOpen(false)}
            >
              إلغاء
            </Button>
            <Button 
              variant="destructive"
              onClick={handleDeleteProduct}
              disabled={loading}
            >
              {loading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              حذف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <Dialog open={isOfferDialogOpen} onOpenChange={setIsOfferDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>إضافة عرض</DialogTitle>
            <DialogDescription>
              أدخل سعر العرض للمنتج.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {productToAddOffer && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 border rounded-md">
                  <div className="h-12 w-12 rounded bg-gray-100 flex items-center justify-center">
                    <img 
                      src={productToAddOffer.image_urls ? productToAddOffer.image_urls[0] : "/placeholder.svg"} 
                      alt={productToAddOffer.name}
                      className="h-8 w-8 object-contain"
                    />
                  </div>
                  <div>
                    <h4 className="font-medium">{productToAddOffer.name}</h4>
                    <p className="text-sm">
                      السعر الأصلي: <span className="font-medium">{productToAddOffer.price} {siteConfig.currency}</span>
                    </p>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="offer_price">سعر العرض</Label>
                  <Input 
                    id="offer_price" 
                    type="number" 
                    placeholder="0.00" 
                    value={productToAddOffer.offer_price || ""}
                    onChange={(e) => setProductToAddOffer({
                      ...productToAddOffer,
                      offer_price: Number(e.target.value)
                    })}
                  />
                </div>
                
                {productToAddOffer.offer_price && productToAddOffer.price && (
                  <div className="text-sm p-2 bg-muted rounded-md">
                    نسبة الخصم: <span className="font-medium text-primary">
                      {Math.round((1 - (productToAddOffer.offer_price / productToAddOffer.price)) * 100)}%
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setIsOfferDialogOpen(false)}
            >
              إلغاء
            </Button>
            <Button 
              onClick={handleAddOffer}
              disabled={loading}
            >
              {loading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              إضافة العرض
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <ShadcnDialog open={isBarcodeDialogOpen} onOpenChange={setIsBarcodeDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>مسح الباركود</DialogTitle>
            <DialogDescription>
              للمنتجات العادية: قم بمسح الباركود الخاص بالمنتج
              <br />
              لمنتجات الميزان: قم بوزن المنتج ومسح باركود الميزان
              <br />
              صيغة باركود الميزان: 2XXXXYYYYYYZ حيث:
              <br />
              XXXX = رمز منتج الميزان (6 أرقام)
              <br />
              YYYYYY = الوزن بالجرام (5 أرقام)
              <br />
              Z = رقم التحقق
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="barcode" className="text-right">
                الباركود
              </Label>
              <Input
                id="barcode"
                value={scannedBarcode}
                onChange={(e) => setScannedBarcode(e.target.value)}
                className="col-span-3"
                placeholder="أدخل الباركود أو امسحه"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <ShadcnButton type="button" onClick={handleBarcodeSubmit}>
              تأكيد
            </ShadcnButton>
          </DialogFooter>
        </DialogContent>
      </ShadcnDialog>
    </MainLayout>
  );
}
