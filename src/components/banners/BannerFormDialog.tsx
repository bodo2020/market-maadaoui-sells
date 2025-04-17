
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, Upload, Search, Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Product } from "@/types";

interface Banner {
  id?: string;
  title: string;
  image_url: string;
  link?: string | null;
  active: boolean;
  position: number;
  products?: string[]; // Array of product IDs
  category_id?: string | null;
  company_id?: string | null;
}

interface BannerFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  banner?: Banner;
}

export default function BannerFormDialog({
  open,
  onOpenChange,
  onSaved,
  banner
}: BannerFormDialogProps) {
  const [formData, setFormData] = useState<Banner>({
    title: "",
    image_url: "",
    link: "",
    active: true,
    position: 0,
    products: [],
    category_id: null,
    company_id: null
  });
  
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [categories, setCategories] = useState<{id: string, name: string}[]>([]);
  const [companies, setCompanies] = useState<{id: string, name: string}[]>([]);
  const [filterType, setFilterType] = useState<"none" | "category" | "company">("none");

  // Load banner data when editing
  useEffect(() => {
    if (banner) {
      setFormData({
        ...banner,
        link: banner.link || "",
        products: banner.products || []
      });
      setPreviewUrl(banner.image_url);
      
      // Fetch selected products
      if (banner.products && banner.products.length > 0) {
        fetchSelectedProducts(banner.products);
      }
    } else {
      resetForm();
    }
  }, [banner, open]);

  // Load products, categories and companies
  useEffect(() => {
    if (open) {
      fetchProducts();
      fetchCategories();
      fetchCompanies();
    }
  }, [open]);

  const fetchProducts = async () => {
    setLoadingProducts(true);
    try {
      const { data, error } = await supabase
        .from("products")
        .select("*");
      
      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error("Error fetching products:", error);
      toast.error("حدث خطأ أثناء تحميل المنتجات");
    } finally {
      setLoadingProducts(false);
    }
  };

  const fetchSelectedProducts = async (productIds: string[]) => {
    try {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .in("id", productIds);
      
      if (error) throw error;
      setSelectedProducts(data || []);
    } catch (error) {
      console.error("Error fetching selected products:", error);
    }
  };

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name")
        .eq("level", "category");
      
      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error("Error fetching categories:", error);
    }
  };

  const fetchCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name");
      
      if (error) throw error;
      setCompanies(data || []);
    } catch (error) {
      console.error("Error fetching companies:", error);
    }
  };

  const resetForm = () => {
    setFormData({
      title: "",
      image_url: "",
      link: "",
      active: true,
      position: 0,
      products: [],
      category_id: null,
      company_id: null
    });
    setImageFile(null);
    setPreviewUrl("");
    setSelectedProducts([]);
    setSearchTerm("");
    setFilterType("none");
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleActiveChange = (checked: boolean) => {
    setFormData({ ...formData, active: checked });
  };

  const handleSave = async () => {
    if (!formData.title) {
      toast.error("يرجى إدخال عنوان البانر");
      return;
    }

    if (!previewUrl && !imageFile) {
      toast.error("يرجى اختيار صورة للبانر");
      return;
    }

    setSaving(true);
    try {
      let imageUrl = formData.image_url;

      // Upload image if new file selected
      if (imageFile) {
        setUploading(true);
        const fileName = `banner-${Date.now()}-${imageFile.name}`;
        
        // Create storage bucket if it doesn't exist
        const { error: bucketError } = await supabase.rpc('create_bucket_if_not_exists', {
          bucket_name: 'banners'
        });
        
        if (bucketError) {
          throw bucketError;
        }
        
        // Upload the file
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('banners')
          .upload(fileName, imageFile);

        if (uploadError) throw uploadError;
        
        // Get public URL
        const { data: urlData } = supabase.storage
          .from('banners')
          .getPublicUrl(fileName);
          
        imageUrl = urlData.publicUrl;
        setUploading(false);
      }

      // Prepare banner data
      const bannerData = {
        ...formData,
        image_url: imageUrl,
        products: selectedProducts.map(p => p.id),
        link: formData.link || null
      };

      if (banner?.id) {
        // Update existing banner
        const { error } = await supabase
          .from('banners')
          .update(bannerData)
          .eq('id', banner.id);
          
        if (error) throw error;
        toast.success("تم تحديث البانر بنجاح");
      } else {
        // Create new banner
        const { error } = await supabase
          .from('banners')
          .insert(bannerData);
          
        if (error) throw error;
        toast.success("تم إضافة البانر بنجاح");
      }

      resetForm();
      onSaved();
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving banner:", error);
      toast.error("حدث خطأ أثناء حفظ البانر");
    } finally {
      setSaving(false);
    }
  };

  const handleAddProduct = (product: Product) => {
    if (!selectedProducts.find(p => p.id === product.id)) {
      setSelectedProducts([...selectedProducts, product]);
      setFormData({
        ...formData, 
        products: [...(formData.products || []), product.id]
      });
    }
  };

  const handleRemoveProduct = (productId: string) => {
    setSelectedProducts(selectedProducts.filter(p => p.id !== productId));
    setFormData({
      ...formData,
      products: (formData.products || []).filter(id => id !== productId)
    });
  };

  const handleFilterTypeChange = (value: string) => {
    setFilterType(value as "none" | "category" | "company");
    // Reset category and company selections
    setFormData({
      ...formData,
      category_id: null,
      company_id: null
    });
  };

  const handleCategoryChange = (value: string) => {
    setFormData({
      ...formData,
      category_id: value || null
    });
  };

  const handleCompanyChange = (value: string) => {
    setFormData({
      ...formData,
      company_id: value || null
    });
  };

  // Filter available products based on search and filter type
  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase());
    const notSelected = !selectedProducts.find(p => p.id === product.id);
    
    let matchesFilter = true;
    if (filterType === "category" && formData.category_id) {
      matchesFilter = product.category_id === formData.category_id;
    } else if (filterType === "company" && formData.company_id) {
      matchesFilter = product.company_id === formData.company_id;
    }
    
    return matchesSearch && notSelected && matchesFilter;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{banner ? "تعديل البانر" : "إضافة بانر جديد"}</DialogTitle>
        </DialogHeader>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Banner Details */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">عنوان البانر</Label>
              <Input
                id="title"
                name="title"
                value={formData.title}
                onChange={handleInputChange}
                placeholder="أدخل عنوان البانر"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="link">رابط البانر (اختياري)</Label>
              <Input
                id="link"
                name="link"
                value={formData.link || ""}
                onChange={handleInputChange}
                placeholder="أدخل الرابط"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="position">ترتيب العرض</Label>
              <Input
                id="position"
                name="position"
                type="number"
                min="0"
                value={formData.position}
                onChange={handleInputChange}
                placeholder="0"
              />
            </div>
            
            <div className="flex items-center space-x-2 space-x-reverse">
              <Switch
                id="active"
                checked={formData.active}
                onCheckedChange={handleActiveChange}
              />
              <Label htmlFor="active">تفعيل البانر</Label>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="image">صورة البانر</Label>
              <div className="border-2 border-dashed rounded-md p-4 text-center">
                {previewUrl ? (
                  <div className="relative aspect-[3/1] overflow-hidden rounded-md">
                    <img 
                      src={previewUrl} 
                      alt="Preview" 
                      className="w-full h-full object-cover"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2"
                      onClick={() => {
                        setPreviewUrl("");
                        setImageFile(null);
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <label className="cursor-pointer flex flex-col items-center justify-center py-4">
                    <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                    <span className="text-sm text-muted-foreground">
                      اختر صورة أو اسحبها هنا
                    </span>
                    <input
                      type="file"
                      id="image"
                      className="hidden"
                      accept="image/*"
                      onChange={handleImageChange}
                    />
                  </label>
                )}
              </div>
            </div>
            
            {/* Filter Type Selection */}
            <div className="space-y-2">
              <Label>ربط البانر بـ</Label>
              <Select value={filterType} onValueChange={handleFilterTypeChange}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر نوع الربط" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون ربط</SelectItem>
                  <SelectItem value="category">ربط بقسم</SelectItem>
                  <SelectItem value="company">ربط بشركة</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Category Selection */}
            {filterType === "category" && (
              <div className="space-y-2">
                <Label>اختر القسم</Label>
                <Select 
                  value={formData.category_id || ""} 
                  onValueChange={handleCategoryChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر القسم" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(category => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            {/* Company Selection */}
            {filterType === "company" && (
              <div className="space-y-2">
                <Label>اختر الشركة</Label>
                <Select 
                  value={formData.company_id || ""} 
                  onValueChange={handleCompanyChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر الشركة" />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map(company => (
                      <SelectItem key={company.id} value={company.id}>
                        {company.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          
          {/* Product Selection */}
          <div className="space-y-4">
            <h3 className="font-medium">إضافة منتجات للبانر</h3>
            
            {/* Selected Products */}
            <div className="space-y-2">
              <Label>المنتجات المختارة ({selectedProducts.length})</Label>
              <div className="border rounded-md h-32 overflow-auto p-2">
                {selectedProducts.length > 0 ? (
                  <div className="space-y-2">
                    {selectedProducts.map(product => (
                      <div key={product.id} className="flex justify-between items-center p-2 border rounded-md">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 bg-muted rounded overflow-hidden">
                            <img
                              src={product.image_urls?.[0] || "/placeholder.svg"}
                              alt={product.name}
                              className="h-full w-full object-cover"
                            />
                          </div>
                          <span className="text-sm font-medium">{product.name}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveProduct(product.id)}
                        >
                          <X className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                    لم يتم إضافة منتجات للبانر
                  </div>
                )}
              </div>
            </div>
            
            {/* Product Search */}
            <div className="space-y-2">
              <Label>إضافة منتجات</Label>
              <div className="relative">
                <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="ابحث عن منتج"
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              
              <ScrollArea className="h-[220px] border rounded-md">
                <div className="p-4 space-y-2">
                  {loadingProducts ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  ) : filteredProducts.length > 0 ? (
                    filteredProducts.map(product => (
                      <div
                        key={product.id}
                        className="flex justify-between items-center p-2 border rounded-md hover:bg-muted/50 cursor-pointer"
                        onClick={() => handleAddProduct(product)}
                      >
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 bg-muted rounded overflow-hidden">
                            <img
                              src={product.image_urls?.[0] || "/placeholder.svg"}
                              alt={product.name}
                              className="h-full w-full object-cover"
                            />
                          </div>
                          <div>
                            <div className="text-sm font-medium">{product.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {product.price} ج.م
                              {product.category_id && <Badge variant="outline" className="mr-2">في قسم</Badge>}
                              {product.company_id && <Badge variant="outline" className="mr-2">تابع لشركة</Badge>}
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAddProduct(product);
                          }}
                        >
                          <Plus className="h-4 w-4 text-primary" />
                        </Button>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-4 text-muted-foreground">
                      لا توجد منتجات مطابقة للبحث
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button onClick={handleSave} disabled={saving || uploading}>
            {(saving || uploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {banner ? "تحديث" : "إضافة"} البانر
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
