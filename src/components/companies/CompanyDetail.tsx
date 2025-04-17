
import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { fetchCompanyById, updateCompany, Company } from "@/services/supabase/companyService";
import { fetchProductsByCompany, updateProduct } from "@/services/supabase/productService";
import { Product } from "@/types";
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Building2, Loader2, Pencil, Check, X, Plus, PackageOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { fetchProducts } from "@/services/supabase/productService";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { siteConfig } from "@/config/site";

export default function CompanyDetail() {
  const { companyId } = useParams<{ companyId: string }>();
  const navigate = useNavigate();
  
  const [company, setCompany] = useState<Company | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editedCompany, setEditedCompany] = useState<Partial<Company>>({});
  const [savingChanges, setSavingChanges] = useState(false);
  const [showAddProductDialog, setShowAddProductDialog] = useState(false);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [addingProducts, setAddingProducts] = useState(false);
  
  useEffect(() => {
    const loadCompanyData = async () => {
      if (!companyId) return;
      
      try {
        setLoading(true);
        const companyData = await fetchCompanyById(companyId);
        setCompany(companyData);
        setEditedCompany(companyData);
        
        const companyProducts = await fetchProductsByCompany(companyId);
        setProducts(companyProducts);
      } catch (error) {
        console.error("Error loading company data:", error);
        toast.error("حدث خطأ أثناء تحميل بيانات الشركة");
      } finally {
        setLoading(false);
      }
    };
    
    loadCompanyData();
  }, [companyId]);
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setEditedCompany(prev => ({ ...prev, [name]: value }));
  };
  
  const handleSaveChanges = async () => {
    if (!company || !companyId) return;
    
    try {
      setSavingChanges(true);
      
      await updateCompany(companyId, editedCompany);
      setCompany({ ...company, ...editedCompany });
      setIsEditing(false);
      
      toast.success("تم تحديث بيانات الشركة بنجاح");
    } catch (error) {
      console.error("Error updating company:", error);
      toast.error("حدث خطأ أثناء تحديث بيانات الشركة");
    } finally {
      setSavingChanges(false);
    }
  };
  
  const handleOpenAddProductDialog = async () => {
    try {
      setLoading(true);
      // Get all products
      const allProductsData = await fetchProducts();
      
      // Filter out products already associated with this company
      const existingProductIds = new Set(products.map(p => p.id));
      const availableProducts = allProductsData.filter(p => !existingProductIds.has(p.id));
      
      setAllProducts(availableProducts);
      setShowAddProductDialog(true);
    } catch (error) {
      console.error("Error loading products:", error);
      toast.error("حدث خطأ أثناء تحميل المنتجات");
    } finally {
      setLoading(false);
    }
  };
  
  const handleAddProducts = async () => {
    if (!companyId || selectedProductIds.size === 0) return;
    
    try {
      setAddingProducts(true);
      
      // Update each selected product with the company ID
      const updatePromises = Array.from(selectedProductIds).map(productId => 
        updateProduct(productId, { company_id: companyId })
      );
      
      await Promise.all(updatePromises);
      
      // Refresh the products list
      const updatedProducts = await fetchProductsByCompany(companyId);
      setProducts(updatedProducts);
      
      setShowAddProductDialog(false);
      setSelectedProductIds(new Set());
      
      toast.success(`تم إضافة ${selectedProductIds.size} منتج للشركة بنجاح`);
    } catch (error) {
      console.error("Error adding products to company:", error);
      toast.error("حدث خطأ أثناء إضافة المنتجات للشركة");
    } finally {
      setAddingProducts(false);
    }
  };
  
  const handleRemoveProduct = async (productId: string) => {
    try {
      setLoading(true);
      
      // Update the product to remove the company association
      await updateProduct(productId, { company_id: null });
      
      // Update the local state
      setProducts(products.filter(p => p.id !== productId));
      
      toast.success("تم إزالة المنتج من الشركة بنجاح");
    } catch (error) {
      console.error("Error removing product from company:", error);
      toast.error("حدث خطأ أثناء إزالة المنتج من الشركة");
    } finally {
      setLoading(false);
    }
  };
  
  const filteredProducts = allProducts.filter(product => 
    product.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    (product.barcode && product.barcode.includes(productSearch))
  );
  
  const toggleProductSelection = (productId: string) => {
    const newSelection = new Set(selectedProductIds);
    if (newSelection.has(productId)) {
      newSelection.delete(productId);
    } else {
      newSelection.add(productId);
    }
    setSelectedProductIds(newSelection);
  };
  
  if (loading && !company) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="mr-2">جاري تحميل بيانات الشركة...</span>
        </div>
      </MainLayout>
    );
  }
  
  if (!company) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center h-64">
          <p className="text-lg text-gray-600 mb-4">لم يتم العثور على الشركة</p>
          <Button onClick={() => navigate("/companies")}>
            <ArrowLeft className="ml-2 h-4 w-4" />
            العودة إلى قائمة الشركات
          </Button>
        </div>
      </MainLayout>
    );
  }
  
  return (
    <MainLayout>
      <div className="mb-6 flex justify-between items-center">
        <div className="flex items-center">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => navigate("/companies")}
            className="ml-3"
          >
            <ArrowLeft className="ml-2 h-4 w-4" />
            العودة
          </Button>
          <h1 className="text-2xl font-bold">{company.name}</h1>
        </div>
        
        {!isEditing ? (
          <Button onClick={() => setIsEditing(true)}>
            <Pencil className="ml-2 h-4 w-4" />
            تعديل الشركة
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setIsEditing(false)}>
              <X className="ml-2 h-4 w-4" />
              إلغاء
            </Button>
            <Button onClick={handleSaveChanges} disabled={savingChanges}>
              {savingChanges ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  جاري الحفظ...
                </>
              ) : (
                <>
                  <Check className="ml-2 h-4 w-4" />
                  حفظ التغييرات
                </>
              )}
            </Button>
          </div>
        )}
      </div>
      
      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">تفاصيل الشركة</TabsTrigger>
          <TabsTrigger value="products">منتجات الشركة</TabsTrigger>
        </TabsList>
        
        <TabsContent value="details">
          <Card>
            <CardHeader>
              <CardTitle>بيانات الشركة</CardTitle>
              <CardDescription>معلومات وتفاصيل الشركة</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex justify-center md:col-span-2">
                  {company.logo_url ? (
                    <div className="w-40 h-40 rounded overflow-hidden border flex items-center justify-center bg-white">
                      <img 
                        src={company.logo_url}
                        alt={company.name}
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>
                  ) : (
                    <div className="w-40 h-40 rounded border flex items-center justify-center bg-gray-100">
                      <Building2 className="h-16 w-16 text-gray-400" />
                    </div>
                  )}
                </div>
                
                {isEditing ? (
                  <>
                    <div>
                      <Label htmlFor="name">اسم الشركة</Label>
                      <Input
                        id="name"
                        name="name"
                        value={editedCompany.name || ""}
                        onChange={handleInputChange}
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="contact_email">البريد الإلكتروني</Label>
                      <Input
                        id="contact_email"
                        name="contact_email"
                        value={editedCompany.contact_email || ""}
                        onChange={handleInputChange}
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="contact_phone">رقم الهاتف</Label>
                      <Input
                        id="contact_phone"
                        name="contact_phone"
                        value={editedCompany.contact_phone || ""}
                        onChange={handleInputChange}
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="address">العنوان</Label>
                      <Input
                        id="address"
                        name="address"
                        value={editedCompany.address || ""}
                        onChange={handleInputChange}
                      />
                    </div>
                    
                    <div className="md:col-span-2">
                      <Label htmlFor="description">الوصف</Label>
                      <Textarea
                        id="description"
                        name="description"
                        value={editedCompany.description || ""}
                        onChange={handleInputChange}
                        rows={4}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <span className="block text-sm font-medium text-gray-500">اسم الشركة</span>
                      <span className="block mt-1">{company.name}</span>
                    </div>
                    
                    <div>
                      <span className="block text-sm font-medium text-gray-500">البريد الإلكتروني</span>
                      <span className="block mt-1">{company.contact_email || "-"}</span>
                    </div>
                    
                    <div>
                      <span className="block text-sm font-medium text-gray-500">رقم الهاتف</span>
                      <span className="block mt-1">{company.contact_phone || "-"}</span>
                    </div>
                    
                    <div>
                      <span className="block text-sm font-medium text-gray-500">العنوان</span>
                      <span className="block mt-1">{company.address || "-"}</span>
                    </div>
                    
                    <div className="md:col-span-2">
                      <span className="block text-sm font-medium text-gray-500">الوصف</span>
                      <p className="mt-1 text-gray-700">{company.description || "-"}</p>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="products">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>منتجات الشركة</CardTitle>
                <CardDescription>المنتجات المرتبطة بهذه الشركة</CardDescription>
              </div>
              <Button onClick={handleOpenAddProductDialog} disabled={loading}>
                <Plus className="ml-2 h-4 w-4" />
                إضافة منتجات
              </Button>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center items-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : products.length === 0 ? (
                <div className="text-center py-16">
                  <PackageOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">لا توجد منتجات مرتبطة بهذه الشركة</p>
                  <Button 
                    variant="outline" 
                    className="mt-4"
                    onClick={handleOpenAddProductDialog}
                  >
                    <Plus className="ml-2 h-4 w-4" />
                    إضافة منتجات
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[80px]">الصورة</TableHead>
                      <TableHead>المنتج</TableHead>
                      <TableHead>الباركود</TableHead>
                      <TableHead>القسم</TableHead>
                      <TableHead>السعر</TableHead>
                      <TableHead className="text-center">المخزون</TableHead>
                      <TableHead className="text-center">خيارات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map(product => (
                      <TableRow key={product.id}>
                        <TableCell>
                          <div className="h-10 w-10 rounded bg-gray-100 flex items-center justify-center">
                            <img 
                              src={product.image_urls ? product.image_urls[0] : "/placeholder.svg"} 
                              alt={product.name} 
                              className="h-8 w-8 object-contain"
                            />
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{product.name}</TableCell>
                        <TableCell>{product.barcode || "-"}</TableCell>
                        <TableCell>
                          {product.category_id ? (
                            <Badge variant="outline">قسم مرتبط</Badge>
                          ) : (
                            <span className="text-xs text-gray-500">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {product.is_offer && product.offer_price ? (
                            <div>
                              <span className="text-primary font-medium">
                                {product.offer_price} {siteConfig.currency}
                              </span>
                              <span className="mr-2 text-xs text-muted-foreground line-through">
                                {product.price} {siteConfig.currency}
                              </span>
                            </div>
                          ) : (
                            <span>{product.price} {siteConfig.currency}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {product.quantity}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleRemoveProduct(product.id)}
                          >
                            <X className="h-4 w-4" />
                            إزالة
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* Add Products Dialog */}
      <Dialog open={showAddProductDialog} onOpenChange={setShowAddProductDialog}>
        <DialogContent className="sm:max-w-[800px]">
          <DialogHeader>
            <DialogTitle>إضافة منتجات إلى الشركة</DialogTitle>
            <DialogDescription>
              اختر المنتجات التي تريد إضافتها إلى شركة {company.name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="mb-4">
            <Input
              placeholder="البحث عن منتج بالاسم أو الباركود"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
            />
          </div>
          
          <ScrollArea className="h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]"></TableHead>
                  <TableHead className="w-[80px]">الصورة</TableHead>
                  <TableHead>المنتج</TableHead>
                  <TableHead>الباركود</TableHead>
                  <TableHead>السعر</TableHead>
                  <TableHead className="text-center">المخزون</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center p-8 text-muted-foreground">
                      لا توجد منتجات مطابقة للبحث أو لا توجد منتجات متاحة للإضافة
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProducts.map(product => (
                    <TableRow 
                      key={product.id}
                      className={selectedProductIds.has(product.id) ? "bg-primary/5" : ""}
                      onClick={() => toggleProductSelection(product.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <TableCell>
                        <div className="h-4 w-4 rounded-sm border flex items-center justify-center">
                          {selectedProductIds.has(product.id) && (
                            <Check className="h-3 w-3 text-primary" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="h-10 w-10 rounded bg-gray-100 flex items-center justify-center">
                          <img 
                            src={product.image_urls ? product.image_urls[0] : "/placeholder.svg"} 
                            alt={product.name} 
                            className="h-8 w-8 object-contain"
                          />
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell>{product.barcode || "-"}</TableCell>
                      <TableCell>
                        {product.is_offer && product.offer_price ? (
                          <div>
                            <span className="text-primary font-medium">
                              {product.offer_price} {siteConfig.currency}
                            </span>
                            <span className="mr-2 text-xs text-muted-foreground line-through">
                              {product.price} {siteConfig.currency}
                            </span>
                          </div>
                        ) : (
                          <span>{product.price} {siteConfig.currency}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {product.quantity}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
          
          <DialogFooter>
            <div className="flex items-center justify-between w-full">
              <div>
                {selectedProductIds.size > 0 && (
                  <span className="text-sm text-gray-500">
                    تم اختيار {selectedProductIds.size} منتج
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => setShowAddProductDialog(false)}
                >
                  إلغاء
                </Button>
                <Button 
                  onClick={handleAddProducts} 
                  disabled={selectedProductIds.size === 0 || addingProducts}
                >
                  {addingProducts ? (
                    <>
                      <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                      جاري الإضافة...
                    </>
                  ) : (
                    <>
                      <Check className="ml-2 h-4 w-4" />
                      إضافة المنتجات
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
