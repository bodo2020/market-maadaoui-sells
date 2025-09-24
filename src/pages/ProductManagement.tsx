import { useState, useEffect, useRef } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { siteConfig } from "@/config/site";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Search, Plus, Pencil, Trash2, Package, ArrowUpDown, MoreHorizontal, Tag, Barcode, Box, Loader2, ScanLine, Image as ImageIcon, FolderOpen, Building2, QrCode, Eye, Edit, ShoppingCart } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Product } from "@/types";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { fetchProducts, createProduct, updateProduct, deleteProduct, fetchProductById } from "@/services/supabase/productService";
import { fetchCompanies } from "@/services/supabase/companyService";
import { fetchMainCategories, fetchSubcategories } from "@/services/supabase/categoryService";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button as ShadcnButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader } from "lucide-react";
import { createOfferForProduct } from "@/services/supabase/offerService";
import { Company, MainCategory, Subcategory } from "@/types";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ProductAssignmentDialog } from "@/components/categories/ProductAssignmentDialog";
import BarcodeScanner from "@/components/POS/BarcodeScanner";

export default function ProductManagement() {
  const navigate = useNavigate();
  const { toast: showToast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [mainCategories, setMainCategories] = useState<MainCategory[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCompany, setSelectedCompany] = useState("all");
  const [selectedMainCategory, setSelectedMainCategory] = useState("all");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isOfferDialogOpen, setIsOfferDialogOpen] = useState(false);
  const [isAssignmentDialogOpen, setIsAssignmentDialogOpen] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [isBarcodeDialogOpen, setIsBarcodeDialogOpen] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Form state for offers
  const [offerData, setOfferData] = useState({
    title: "",
    discount_type: "percentage",
    discount_value: 0,
    valid_from: "",
    valid_to: "",
    description: ""
  });

  useEffect(() => {
    loadProducts();
    loadCompanies();
    loadMainCategories();
    loadSubcategories();
  }, []);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const data = await fetchProducts();
      setProducts(data || []);
    } catch (error) {
      console.error('Error loading products:', error);
      showToast({
        title: "خطأ",
        description: "فشل في تحميل المنتجات",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadCompanies = async () => {
    try {
      const data = await fetchCompanies();
      setCompanies(data || []);
    } catch (error) {
      console.error('Error loading companies:', error);
    }
  };

  const loadMainCategories = async () => {
    try {
      const data = await fetchMainCategories();
      setMainCategories(data || []);
    } catch (error) {
      console.error('Error loading main categories:', error);
    }
  };

  const loadSubcategories = async () => {
    try {
      const data = await fetchSubcategories();
      setSubcategories(data || []);
    } catch (error) {
      console.error('Error loading subcategories:', error);
    }
  };

  // Filter products based on search and selected filters
  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(search.toLowerCase()) ||
                         (product.barcode && product.barcode.includes(search));
    const matchesCompany = selectedCompany === "all" || product.company_id === selectedCompany;
    const matchesMainCategory = selectedMainCategory === "all" || product.main_category_id === selectedMainCategory;
    
    return matchesSearch && matchesCompany && matchesMainCategory;
  });

  const handleDeleteProduct = async () => {
    if (!selectedProduct) return;
    
    try {
      await deleteProduct(selectedProduct.id);
      setProducts(products.filter(p => p.id !== selectedProduct.id));
      setIsDeleteConfirmOpen(false);
      setSelectedProduct(null);
      showToast({
        title: "تم الحذف بنجاح",
        description: "تم حذف المنتج بنجاح",
      });
    } catch (error) {
      console.error('Error deleting product:', error);
      showToast({
        title: "خطأ",
        description: "فشل في حذف المنتج",
        variant: "destructive",
      });
    }
  };

  const handleAddOffer = async () => {
    if (!selectedProduct) return;

    try {
      await createOfferForProduct(selectedProduct.id, offerData);
      setIsOfferDialogOpen(false);
      setOfferData({
        title: "",
        discount_type: "percentage",
        discount_value: 0,
        valid_from: "",
        valid_to: "",
        description: ""
      });
      showToast({
        title: "تم إنشاء العرض بنجاح",
        description: "تم إضافة العرض للمنتج بنجاح",
      });
    } catch (error) {
      console.error('Error creating offer:', error);
      showToast({
        title: "خطأ",
        description: "فشل في إنشاء العرض",
        variant: "destructive",
      });
    }
  };

  const handleBarcodeScanning = () => {
    setIsScannerOpen(true);
  };

  const handleBarcodeScan = (barcode: string) => {
    const foundProduct = products.find(p => p.barcode === barcode);
    if (foundProduct) {
      navigate(`/product-details/${foundProduct.id}`);
      toast.success(`تم العثور على المنتج: ${foundProduct.name}`);
    } else {
      toast.error("لم يتم العثور على منتج بهذا الباركود");
    }
    setIsScannerOpen(false);
  };

  const handleEditClick = (product: Product) => {
    navigate(`/add-product?id=${product.id}`);
  };

  const handleAddOfferClick = (product: Product) => {
    setSelectedProduct(product);
    setIsOfferDialogOpen(true);
  };

  return (
    <MainLayout>
      <div className="flex-1 space-y-4 p-4 pt-6">
        <div className="flex items-center justify-between space-y-2">
          <h2 className="text-3xl font-bold tracking-tight">إدارة المنتجات</h2>
          <div className="flex items-center space-x-2 space-x-reverse">
            <Button onClick={() => navigate("/add-product")}>
              <Plus className="ml-2 h-4 w-4" />
              إضافة منتج جديد
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>قائمة المنتجات</CardTitle>
            <CardDescription>
              إدارة وعرض جميع المنتجات في النظام
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2 space-x-reverse mb-4">
              <Input
                placeholder="البحث عن منتج..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-sm"
              />
              <Button variant="outline">
                <Search className="ml-2 h-4 w-4" />
                بحث
              </Button>
              <Button variant="outline" onClick={handleBarcodeScanning}>
                <QrCode className="ml-2 h-4 w-4" />
                ماسح الباركود
              </Button>
            </div>
            
            <div className="flex gap-2 flex-wrap">
              <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="فلترة بالشركة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الشركات</SelectItem>
                  {companies.map((company) => (
                    <SelectItem key={company.id} value={company.id}>
                      {company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedMainCategory} onValueChange={setSelectedMainCategory}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="فلترة بالفئة الرئيسية" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الفئات</SelectItem>
                  {mainCategories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedProducts.length > 0 && (
                <Button
                  variant="outline"
                  onClick={() => setIsAssignmentDialogOpen(true)}
                >
                  <Tag className="ml-2 h-4 w-4" />
                  تصنيف المنتجات المحددة ({selectedProducts.length})
                </Button>
              )}
            </div>

            {loading ? (
              <div className="flex justify-center items-center py-8">
                <Loader2 className="h-8 w-8 animate-spin" />
                <span className="mr-2">جاري تحميل المنتجات...</span>
              </div>
            ) : (
              <div className="rounded-md border mt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={selectedProducts.length === filteredProducts.length && filteredProducts.length > 0}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedProducts(filteredProducts.map(p => p.id));
                            } else {
                              setSelectedProducts([]);
                            }
                          }}
                        />
                      </TableHead>
                      <TableHead>الصورة</TableHead>
                      <TableHead>اسم المنتج</TableHead>
                      <TableHead>الباركود</TableHead>
                      <TableHead>السعر</TableHead>
                      <TableHead>المخزون</TableHead>
                      <TableHead>الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProducts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8">
                          <div className="flex flex-col items-center justify-center space-y-2">
                            <Package className="h-8 w-8 text-muted-foreground" />
                            <p className="text-muted-foreground">
                              {products.length === 0 ? "لا توجد منتجات" : "لم يتم العثور على منتجات"}
                            </p>
                            {products.length === 0 && (
                              <Button variant="outline" onClick={() => navigate("/add-product")}>
                                <Plus className="ml-2 h-4 w-4" />
                                إضافة منتج جديد
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredProducts.map((product) => (
                        <TableRow 
                          key={product.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => navigate(`/product-details/${product.id}`)}
                        >
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedProducts.includes(product.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedProducts([...selectedProducts, product.id]);
                                } else {
                                  setSelectedProducts(selectedProducts.filter(id => id !== product.id));
                                }
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            {product.image_urls && product.image_urls.length > 0 ? (
                              <img 
                                src={product.image_urls[0]} 
                                alt={product.name}
                                className="w-10 h-10 object-cover rounded"
                              />
                            ) : (
                              <div className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center">
                                <span className="text-xs text-gray-500">لا توجد صورة</span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="font-medium">{product.name}</TableCell>
                          <TableCell>{product.barcode || 'غير محدد'}</TableCell>
                          <TableCell>{product.price} ج.م</TableCell>
                          <TableCell>{product.quantity}</TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0">
                                  <span className="sr-only">فتح القائمة</span>
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => navigate(`/product-details/${product.id}`)}>
                                  <Eye className="ml-2 h-4 w-4" />
                                  عرض التفاصيل
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleEditClick(product)}>
                                  <Edit className="ml-2 h-4 w-4" />
                                  تعديل
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleAddOfferClick(product)}>
                                  <ShoppingCart className="ml-2 h-4 w-4" />
                                  إضافة عرض
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => {
                                    setSelectedProduct(product);
                                    setIsDeleteConfirmOpen(true);
                                  }}
                                  className="text-red-600"
                                >
                                  <Trash2 className="ml-2 h-4 w-4" />
                                  حذف
                                </DropdownMenuItem>
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

        {/* Delete Confirmation Dialog */}
        <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>تأكيد الحذف</DialogTitle>
              <DialogDescription>
                هل أنت متأكد من حذف المنتج "{selectedProduct?.name}"؟ هذا الإجراء لا يمكن التراجع عنه.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDeleteConfirmOpen(false)}>
                إلغاء
              </Button>
              <Button variant="destructive" onClick={handleDeleteProduct}>
                حذف
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Offer Dialog */}
        <Dialog open={isOfferDialogOpen} onOpenChange={setIsOfferDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>إضافة عرض للمنتج</DialogTitle>
              <DialogDescription>
                إضافة عرض خاص للمنتج "{selectedProduct?.name}"
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="offer-title">عنوان العرض</Label>
                <Input
                  id="offer-title"
                  value={offerData.title}
                  onChange={(e) => setOfferData({...offerData, title: e.target.value})}
                  placeholder="مثال: خصم 20% على المنتج"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>نوع الخصم</Label>
                  <Select value={offerData.discount_type} onValueChange={(value) => setOfferData({...offerData, discount_type: value})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">نسبة مئوية</SelectItem>
                      <SelectItem value="fixed">مبلغ ثابت</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>قيمة الخصم</Label>
                  <Input
                    type="number"
                    value={offerData.discount_value}
                    onChange={(e) => setOfferData({...offerData, discount_value: Number(e.target.value)})}
                    placeholder="20"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>تاريخ البداية</Label>
                  <Input
                    type="date"
                    value={offerData.valid_from}
                    onChange={(e) => setOfferData({...offerData, valid_from: e.target.value})}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>تاريخ النهاية</Label>
                  <Input
                    type="date"
                    value={offerData.valid_to}
                    onChange={(e) => setOfferData({...offerData, valid_to: e.target.value})}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsOfferDialogOpen(false)}>
                إلغاء
              </Button>
              <Button onClick={handleAddOffer}>إضافة العرض</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Product Assignment Dialog */}
        <ProductAssignmentDialog
          isOpen={isAssignmentDialogOpen}
          onClose={() => setIsAssignmentDialogOpen(false)}
          selectedProductIds={selectedProducts}
          onAssignmentComplete={() => {
            setSelectedProducts([]);
            loadProducts();
          }}
        />

        {/* Barcode Scanner */}
        <BarcodeScanner
          isOpen={isScannerOpen}
          onClose={() => setIsScannerOpen(false)}
          onScan={handleBarcodeScan}
        />
      </div>
    </MainLayout>
  );
}