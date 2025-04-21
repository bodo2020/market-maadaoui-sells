
import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Upload, Search, Plus, ArrowRight, X } from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import type { Product } from "@/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

interface BannerData {
  id: string;
  title: string;
  image_url: string;
  link: string | null;
  active: boolean | null;
  position: number | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string | null;
  updated_at: string | null;
  products?: string[]; // Custom field not in database schema
  category_id?: string | null; // Custom field not in database schema
  company_id?: string | null; // Custom field not in database schema
}

export default function AddBanner() {
  const [searchParams] = useSearchParams();
  const bannerId = searchParams.get("id");
  const navigate = useNavigate();
  
  const [formData, setFormData] = useState({
    title: "",
    image_url: "",
    link: "",
    active: true,
    position: 0,
    products: [] as string[],
    category_id: null as string | null,
    company_id: null as string | null
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
  const [error, setError] = useState<string | null>(null);
  const [creatingBucket, setCreatingBucket] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [categoryOptions, setCategoryOptions] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    if (bannerId) {
      fetchBanner();
    }
    fetchProducts();
    fetchCategories();
    fetchCompanies();
    checkBannersBucket();
  }, [bannerId]);

  const checkBannersBucket = async () => {
    try {
      const { error } = await supabase.storage.from('banners').list();
      
      if (error) {
        console.log("Banners bucket needs to be created:", error);
        await createBannersBucket();
      }
    } catch (err) {
      console.error("Error checking banners bucket:", err);
      await createBannersBucket();
    }
  };

  const createBannersBucket = async () => {
    setCreatingBucket(true);
    setError(null);
    
    try {
      console.log("Attempting to create banners bucket via edge function...");
      
      const response = await fetch(
        "https://qzvpayjaadbmpayeglon.functions.supabase.co/create_banners_bucket",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
        }
      );
      
      const result = await response.json();
      
      if (!response.ok) {
        console.error("Error creating banners bucket:", result);
        setError(`خطأ في إنشاء مجلد البانرات: ${result.error || 'حدث خطأ غير معروف'}`);
      } else {
        console.log("Banners bucket response:", result);
        
        const { error: checkError } = await supabase.storage.from('banners').list();
        if (checkError) {
          console.error("Bucket still not accessible after creation:", checkError);
          setError("تم محاولة إنشاء مجلد البانرات لكن لا يمكن الوصول إليه. يرجى التحقق من الإعدادات.");
        } else {
          toast.success("تم إنشاء مجلد البانرات بنجاح");
        }
      }
    } catch (error: any) {
      console.error("Storage initialization error:", error);
      setError(`خطأ في تهيئة التخزين: ${error.message || 'حدث خطأ غير معروف'}`);
    } finally {
      setCreatingBucket(false);
    }
  };

  const fetchBanner = async () => {
    try {
      const { data, error } = await supabase
        .from('banners')
        .select('*')
        .eq('id', bannerId)
        .single();
      
      if (error) throw error;
      
      if (data) {
        const bannerData = data as unknown as BannerData;
        
        setFormData({
          title: bannerData.title,
          image_url: bannerData.image_url,
          link: bannerData.link || "",
          active: bannerData.active !== null ? bannerData.active : true,
          position: bannerData.position !== null ? bannerData.position : 0,
          products: Array.isArray(bannerData.products) ? bannerData.products : [],
          category_id: bannerData.category_id || null,
          company_id: bannerData.company_id || null
        });
        setPreviewUrl(bannerData.image_url);
        
        if (bannerData.products && Array.isArray(bannerData.products) && bannerData.products.length > 0) {
          fetchSelectedProducts(bannerData.products);
        }
      }
    } catch (error) {
      console.error('Error fetching banner:', error);
      toast.error("حدث خطأ أثناء تحميل البانر");
    }
  };

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
        .from('main_categories')
        .select('id, name')
        .order('name');
      
      if (error) throw error;
      
      const options = (data || []).map(cat => ({
        value: cat.id,
        label: cat.name
      }));
      
      setCategoryOptions(options);
    } catch (error) {
      console.error('Error fetching categories:', error);
      toast.error("حدث خطأ في تحميل الأقسام");
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

  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      if (selectedProducts.some(p => p.id === product.id)) {
        return false;
      }
      
      if (searchTerm) {
        return product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
               (product.barcode && product.barcode.toLowerCase().includes(searchTerm.toLowerCase()));
      }
      return true;
    });
  }, [products, selectedProducts, searchTerm]);

  const uploadImage = async (file: File): Promise<string> => {
    setUploading(true);
    setError(null);
    
    try {
      const { error: bucketCheckError } = await supabase.storage.from('banners').list();
      
      if (bucketCheckError) {
        console.log("Bucket check failed, trying to create it:", bucketCheckError);
        await createBannersBucket();
        
        const { error: recheckError } = await supabase.storage.from('banners').list();
        if (recheckError) {
          throw new Error("مجلد البانرات غير متاح حتى بعد محاولة إنشاءه. يرجى المحاولة مرة أخرى لاحقًا.");
        }
      }
      
      const fileName = `banner-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
      
      const { data, error } = await supabase.storage
        .from('banners')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });
      
      if (error) {
        throw error;
      }
      
      const { data: urlData } = supabase.storage
        .from('banners')
        .getPublicUrl(fileName);
        
      return urlData.publicUrl;
    } catch (error: any) {
      console.error("Error uploading image:", error);
      setError(`خطأ في رفع الصورة: ${error.message || 'حدث خطأ غير معروف'}`);
      throw error;
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setError(null);
    
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

      if (imageFile) {
        try {
          imageUrl = await uploadImage(imageFile);
        } catch (error) {
          setSaving(false);
          return;
        }
      }

      const bannerData = {
        ...formData,
        image_url: imageUrl,
        products: selectedProducts.map(p => p.id), // Now properly mapped to string[]
        link: formData.link || null,
        category_id: formData.category_id === "null" ? null : formData.category_id,
        company_id: formData.company_id === "null" ? null : formData.company_id
      };

      if (bannerId) {
        const { error } = await supabase
          .from('banners')
          .update(bannerData)
          .eq('id', bannerId);
          
        if (error) throw error;
        toast.success("تم تحديث البانر بنجاح");
      } else {
        const { error } = await supabase
          .from('banners')
          .insert(bannerData);
          
        if (error) throw error;
        toast.success("تم إضافة البانر بنجاح");
      }

      navigate('/banners');
    } catch (error: any) {
      console.error("Error saving banner:", error);
      setError(`خطأ في حفظ البانر: ${error.message || 'حدث خطأ غير معروف'}`);
      toast.error("حدث خطأ أثناء حفظ البانر");
    } finally {
      setSaving(false);
    }
  };

  return (
    <MainLayout>
      <div className="container mx-auto p-6 max-w-7xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              onClick={() => {
                if (bannerId) {
                  navigate(`/banners/edit?id=${bannerId}`);
                } else {
                  navigate('/banners/add');
                }
              }}
              className="gap-2"
            >
              <ArrowRight className="h-4 w-4" />
              رجوع
            </Button>
            <h1 className="text-2xl font-bold">
              {bannerId ? "تعديل البانر" : "إضافة بانر جديد"}
            </h1>
          </div>
          <Button 
            onClick={handleSave} 
            disabled={saving || uploading || creatingBucket}
            className="min-w-[120px]"
          >
            {(saving || uploading || creatingBucket) && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            حفظ
          </Button>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {creatingBucket && (
          <Alert className="mb-6">
            <Loader2 className="h-4 w-4 animate-spin" />
            <AlertDescription>جاري إنشاء مجلد البانرات...</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">عنوان البانر</Label>
                <Input
                  id="title"
                  name="title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="أدخل عنوان البانر"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="link">رابط البانر (اختياري)</Label>
                <Input
                  id="link"
                  name="link"
                  value={formData.link || ""}
                  onChange={(e) => setFormData({ ...formData, link: e.target.value })}
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
                  onChange={(e) => setFormData({ ...formData, position: Number(e.target.value) })}
                  placeholder="0"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="active">تفعيل البانر</Label>
                <Switch
                  id="active"
                  checked={formData.active}
                  onCheckedChange={(checked) => setFormData({ ...formData, active: checked })}
                />
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
                        className="absolute top-2 left-2"
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
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            const file = e.target.files[0];
                            setImageFile(file);
                            setPreviewUrl(URL.createObjectURL(file));
                          }
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>ربط البانر بـ</Label>
                <Select value={filterType} onValueChange={(value) => {
                  setFilterType(value as "none" | "category" | "company");
                  setFormData({
                    ...formData,
                    category_id: null,
                    company_id: null
                  });
                }}>
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
              
              {filterType === "category" && (
                <div className="space-y-2">
                  <Label>اختر القسم</Label>
                  <Select 
                    value={formData.category_id || "null"} 
                    onValueChange={(value) => setFormData({ 
                      ...formData, 
                      category_id: value === "null" ? null : value 
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="اختر القسم" />
                    </SelectTrigger>
                    <SelectContent>
                      {categoryOptions.map(category => (
                        <SelectItem key={category.value} value={category.value}>
                          {category.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              {filterType === "company" && (
                <div className="space-y-2">
                  <Label>اختر الشركة</Label>
                  <Select 
                    value={formData.company_id || "null"} 
                    onValueChange={(value) => setFormData({ 
                      ...formData, 
                      company_id: value === "null" ? null : value  
                    })}
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
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6 space-y-4">
              <h3 className="font-medium">إضافة منتجات للبانر</h3>
              
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
                            onClick={() => {
                              setSelectedProducts(selectedProducts.filter(p => p.id !== product.id));
                              setFormData({
                                ...formData,
                                products: formData.products?.filter(id => id !== product.id) || []
                              });
                            }}
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
              
              <div className="space-y-2">
                <Label>إضافة منتجات</Label>
                <div className="relative">
                  <Input
                    placeholder="ابحث عن منتج"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pr-10"
                  />
                  <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
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
                          onClick={() => {
                            if (!selectedProducts.find(p => p.id === product.id)) {
                              setSelectedProducts([...selectedProducts, product]);
                              setFormData({
                                ...formData,
                                products: [...(formData.products || []), product.id]
                              });
                            }
                          }}
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
                                {product.category_id && (
                                  <Badge variant="outline" className="mr-2">في قسم</Badge>
                                )}
                                {product.company_id && (
                                  <Badge variant="outline" className="mr-2">تابع لشركة</Badge>
                                )}
                              </div>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!selectedProducts.find(p => p.id === product.id)) {
                                setSelectedProducts([...selectedProducts, product]);
                                setFormData({
                                  ...formData,
                                  products: [...(formData.products || []), product.id]
                                });
                              }
                            }}
                            className="hover:bg-transparent"
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
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}

