import { useState, useEffect } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { MainCategory, Subcategory } from "@/types";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ImagePlus, Plus, Trash } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export default function AddProduct() {
  const navigate = useNavigate();
  
  // Product data
  const [name, setName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState(0);
  const [price, setPrice] = useState<number | string>("");
  const [purchasePrice, setPurchasePrice] = useState<number | string>("");
  const [unitOfMeasure, setUnitOfMeasure] = useState("");
  const [manufacturerName, setManufacturerName] = useState("");

  // Bulk options
  const [bulkEnabled, setBulkEnabled] = useState(false);
  const [bulkQuantity, setBulkQuantity] = useState<number | string>("");
  const [bulkPrice, setBulkPrice] = useState<number | string>("");
  const [bulkBarcode, setBulkBarcode] = useState("");
  
  // Special offer
  const [isOffer, setIsOffer] = useState(false);
  const [offerPrice, setOfferPrice] = useState<number | string>("");
  
  // Category selection
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [categories, setCategories] = useState<MainCategory[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  
  // Image handling
  const [images, setImages] = useState<File[]>([]);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Company selection
  const [companies, setCompanies] = useState<{id: string, name: string}[]>([]);
  const [companyId, setCompanyId] = useState("");
  
  useEffect(() => {
    fetchCategories();
    fetchCompanies();
  }, []);
  
  useEffect(() => {
    if (categoryId) {
      fetchSubcategories(categoryId);
    } else {
      setSubcategories([]);
      setSubcategoryId("");
    }
  }, [categoryId]);
  
  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('main_categories')
        .select('*')
        .order('name');
      
      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
      toast.error('حدث خطأ أثناء تحميل التصنيفات');
    }
  };
  
  const fetchSubcategories = async (categoryId: string) => {
    try {
      const { data, error } = await supabase
        .from('subcategories')
        .select('*')
        .eq('category_id', categoryId)
        .order('name');
      
      if (error) throw error;
      setSubcategories(data || []);
    } catch (error) {
      console.error('Error fetching subcategories:', error);
      toast.error('حدث خطأ أثناء تحميل التصنيفات الفرعية');
    }
  };
  
  const fetchCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name')
        .order('name');
      
      if (error) throw error;
      setCompanies(data || []);
    } catch (error) {
      console.error('Error fetching companies:', error);
      toast.error('حدث خطأ أثناء تحميل الشركات');
    }
  };
  
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const newImages = [...images];
      const newImageUrls = [...imageUrls];
      
      Array.from(files).forEach(file => {
        newImages.push(file);
        newImageUrls.push(URL.createObjectURL(file));
      });
      
      setImages(newImages);
      setImageUrls(newImageUrls);
    }
  };
  
  const removeImage = (index: number) => {
    const newImages = [...images];
    const newImageUrls = [...imageUrls];
    
    URL.revokeObjectURL(newImageUrls[index]);
    newImages.splice(index, 1);
    newImageUrls.splice(index, 1);
    
    setImages(newImages);
    setImageUrls(newImageUrls);
  };
  
  const uploadImages = async () => {
    if (images.length === 0) return [];
    
    setUploadingImages(true);
    const uploadedUrls: string[] = [];
    
    try {
      for (const file of images) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
        const filePath = `products/${fileName}`;
        
        const { error: uploadError } = await supabase.storage
          .from('images')
          .upload(filePath, file);
          
        if (uploadError) throw uploadError;
        
        const { data: { publicUrl } } = supabase.storage
          .from('images')
          .getPublicUrl(filePath);
          
        uploadedUrls.push(publicUrl);
      }
      
      return uploadedUrls;
    } catch (error) {
      console.error('Error uploading images:', error);
      toast.error('حدث خطأ أثناء رفع الصور');
      throw error;
    } finally {
      setUploadingImages(false);
    }
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name || price === '') {
      toast.error('يرجى ملء جميع الحقول المطلوبة');
      return;
    }
    
    try {
      setLoading(true);
      
      // Upload images
      const imageUrls = await uploadImages();
      
      // Create product object
      const productData = {
        name,
        barcode: barcode || null,
        description: description || null,
        quantity: quantity || 0,
        price: Number(price),
        purchase_price: Number(purchasePrice) || 0,
        is_offer: isOffer,
        offer_price: isOffer ? Number(offerPrice) : null,
        category_id: categoryId || null,
        subcategory_id: subcategoryId || null,
        company_id: companyId || null,
        image_urls: imageUrls,
        bulk_enabled: bulkEnabled,
        bulk_quantity: bulkEnabled ? Number(bulkQuantity) : null,
        bulk_price: bulkEnabled ? Number(bulkPrice) : null,
        bulk_barcode: bulkEnabled ? bulkBarcode : null,
        manufacturer_name: manufacturerName || null,
        unit_of_measure: unitOfMeasure || null
      };
      
      // Insert product
      const { error } = await supabase
        .from('products')
        .insert([productData]);
      
      if (error) throw error;
      
      toast.success('تم إضافة المنتج بنجاح');
      navigate('/products');
    } catch (error) {
      console.error('Error adding product:', error);
      toast.error('حدث خطأ أثناء إضافة المنتج');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <MainLayout>
      <div className="container py-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">إضافة منتج جديد</h1>
          <Button variant="outline" onClick={() => navigate('/products')}>
            العودة للمنتجات
          </Button>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Product basic info */}
            <Card>
              <CardContent className="pt-6 space-y-4">
                <h2 className="text-xl font-semibold">بيانات المنتج</h2>
                
                <div>
                  <Label htmlFor="name">اسم المنتج</Label>
                  <Input 
                    id="name"
                    value={name} 
                    onChange={e => setName(e.target.value)}
                    placeholder="أدخل اسم المنتج" 
                    className="mt-1"
                  />
                </div>
                
                <div>
                  <Label htmlFor="barcode">الباركود (اختياري)</Label>
                  <Input 
                    id="barcode"
                    value={barcode} 
                    onChange={e => setBarcode(e.target.value)}
                    placeholder="أدخل الباركود" 
                    className="mt-1"
                  />
                </div>
                
                <div>
                  <Label htmlFor="description">وصف المنتج (اختياري)</Label>
                  <Textarea 
                    id="description"
                    value={description} 
                    onChange={e => setDescription(e.target.value)}
                    placeholder="أدخل وصف المنتج" 
                    className="mt-1"
                  />
                </div>
                
                <div>
                  <Label htmlFor="manufacturer">الشركة المصنعة (اختياري)</Label>
                  <Input 
                    id="manufacturer"
                    value={manufacturerName} 
                    onChange={e => setManufacturerName(e.target.value)}
                    placeholder="أدخل اسم الشركة المصنعة" 
                    className="mt-1"
                  />
                </div>
                
                <div>
                  <Label htmlFor="unit">وحدة القياس (اختياري)</Label>
                  <Select value={unitOfMeasure} onValueChange={setUnitOfMeasure}>
                    <SelectTrigger>
                      <SelectValue placeholder="اختر وحدة القياس" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="قطعة">قطعة</SelectItem>
                      <SelectItem value="علبة">علبة</SelectItem>
                      <SelectItem value="كيلو">كيلو</SelectItem>
                      <SelectItem value="جرام">جرام</SelectItem>
                      <SelectItem value="لتر">لتر</SelectItem>
                      <SelectItem value="متر">متر</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
            
            {/* Product prices */}
            <Card>
              <CardContent className="pt-6 space-y-4">
                <h2 className="text-xl font-semibold">الأسعار والمخزون</h2>
                
                <div>
                  <Label htmlFor="quantity">الكمية المتوفرة</Label>
                  <Input 
                    id="quantity"
                    type="number"
                    value={quantity}
                    onChange={e => setQuantity(parseInt(e.target.value) || 0)}
                    placeholder="أدخل الكمية" 
                    className="mt-1"
                    min="0"
                  />
                </div>
                
                <div>
                  <Label htmlFor="price">سعر البيع</Label>
                  <Input 
                    id="price"
                    type="number"
                    step="0.01"
                    value={price}
                    onChange={e => setPrice(e.target.value)}
                    placeholder="أدخل سعر البيع" 
                    className="mt-1"
                    min="0"
                  />
                </div>
                
                <div>
                  <Label htmlFor="purchasePrice">سعر الشراء</Label>
                  <Input 
                    id="purchasePrice"
                    type="number"
                    step="0.01"
                    value={purchasePrice}
                    onChange={e => setPurchasePrice(e.target.value)}
                    placeholder="أدخل سعر الشراء" 
                    className="mt-1"
                    min="0"
                  />
                </div>
                
                <div className="flex items-center space-x-2">
                  <Switch
                    id="isOffer"
                    checked={isOffer}
                    onCheckedChange={setIsOffer}
                  />
                  <Label htmlFor="isOffer" className="mr-2">تفعيل العرض</Label>
                </div>
                
                {isOffer && (
                  <div>
                    <Label htmlFor="offerPrice">سعر العرض</Label>
                    <Input 
                      id="offerPrice"
                      type="number"
                      step="0.01"
                      value={offerPrice}
                      onChange={e => setOfferPrice(e.target.value)}
                      placeholder="أدخل سعر العرض" 
                      className="mt-1"
                      min="0"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
            
            {/* Bulk options */}
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold">خيارات البيع بالجملة</h2>
                  <Switch
                    id="bulkEnabled"
                    checked={bulkEnabled}
                    onCheckedChange={setBulkEnabled}
                  />
                </div>
                
                {bulkEnabled && (
                  <>
                    <div>
                      <Label htmlFor="bulkQuantity">كمية الجملة</Label>
                      <Input 
                        id="bulkQuantity"
                        type="number"
                        value={bulkQuantity}
                        onChange={e => setBulkQuantity(e.target.value)}
                        placeholder="أدخل كمية الجملة" 
                        className="mt-1"
                        min="0"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="bulkPrice">سعر الجملة</Label>
                      <Input 
                        id="bulkPrice"
                        type="number"
                        step="0.01"
                        value={bulkPrice}
                        onChange={e => setBulkPrice(e.target.value)}
                        placeholder="أدخل سعر الجملة" 
                        className="mt-1"
                        min="0"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="bulkBarcode">باركود الجملة (اختياري)</Label>
                      <Input 
                        id="bulkBarcode"
                        value={bulkBarcode}
                        onChange={e => setBulkBarcode(e.target.value)}
                        placeholder="أدخل باركود الجملة" 
                        className="mt-1"
                      />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
            
            {/* Categories */}
            <Card>
              <CardContent className="pt-6 space-y-4">
                <h2 className="text-xl font-semibold">التصنيفات والشركات</h2>
                
                <div>
                  <Label htmlFor="company">الشركة (اختياري)</Label>
                  <Select value={companyId} onValueChange={setCompanyId}>
                    <SelectTrigger>
                      <SelectValue placeholder="اختر الشركة" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">بدون شركة</SelectItem>
                      {companies.map(company => (
                        <SelectItem key={company.id} value={company.id}>
                          {company.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="category">التصنيف الرئيسي (اختياري)</Label>
                  <Select value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger>
                      <SelectValue placeholder="اختر التصنيف" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">بدون تصنيف</SelectItem>
                      {categories.map(category => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {categoryId && (
                  <div>
                    <Label htmlFor="subcategory">التصنيف الفرعي (اختياري)</Label>
                    <Select value={subcategoryId} onValueChange={setSubcategoryId}>
                      <SelectTrigger>
                        <SelectValue placeholder="اختر التصنيف الفرعي" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">بدون تصنيف فرعي</SelectItem>
                        {subcategories.map(subcategory => (
                          <SelectItem key={subcategory.id} value={subcategory.id}>
                            {subcategory.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          
          {/* Images */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <h2 className="text-xl font-semibold">صور المنتج</h2>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {imageUrls.map((url, index) => (
                  <div key={index} className="relative h-32 border rounded-md overflow-hidden">
                    <img 
                      src={url} 
                      alt={`Product ${index + 1}`} 
                      className="h-full w-full object-cover"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute top-1 right-1 h-6 w-6"
                      onClick={() => removeImage(index)}
                    >
                      <Trash className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                
                <label className="h-32 border border-dashed rounded-md flex flex-col items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors">
                  <input 
                    type="file" 
                    accept="image/*" 
                    multiple 
                    className="hidden"
                    onChange={handleImageChange}
                  />
                  <ImagePlus className="h-8 w-8 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground mt-2">إضافة صور</span>
                </label>
              </div>
            </CardContent>
          </Card>
          
          <div className="flex justify-end">
            <Button type="submit" disabled={loading || uploadingImages} size="lg">
              {(loading || uploadingImages) ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  جاري الحفظ...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  إضافة المنتج
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </MainLayout>
  );
}
