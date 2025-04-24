
// Fix CompanyDetails.tsx by removing subsubcategories references

// Start with imports and all necessary components
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { Image as ImageIcon, Save, Trash, Loader2, Building, Package } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { fetchProductsByCompany } from "@/services/supabase/productService";
import { Product } from "@/types";

export default function CompanyDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  
  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  
  // Load company data
  useEffect(() => {
    if (id) {
      fetchCompanyData();
      fetchCompanyProducts();
      fetchCategories();
    }
  }, [id]);
  
  const fetchCompanyData = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .eq("id", id)
        .single();
        
      if (error) throw error;
      
      setName(data.name || "");
      setDescription(data.description || "");
      setAddress(data.address || "");
      setContactPhone(data.contact_phone || "");
      setContactEmail(data.contact_email || "");
      setLogoUrl(data.logo_url || null);
      
    } catch (error) {
      console.error("Error fetching company:", error);
      toast.error("حدث خطأ أثناء تحميل بيانات الشركة");
    } finally {
      setLoading(false);
    }
  };
  
  const fetchCompanyProducts = async () => {
    try {
      const data = await fetchProductsByCompany(id!);
      setProducts(data);
    } catch (error) {
      console.error("Error fetching company products:", error);
      toast.error("حدث خطأ أثناء تحميل منتجات الشركة");
    }
  };
  
  const fetchCategories = async () => {
    try {
      // Fetch only main categories
      const { data, error } = await supabase
        .from("main_categories")
        .select("id, name");
        
      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error("Error fetching categories:", error);
    }
  };
  
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      // Create image preview
      const reader = new FileReader();
      reader.onload = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };
  
  const uploadLogo = async (file: File) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
    const filePath = `companies/${fileName}`;

    try {
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('images')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('images')
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (error) {
      console.error('Error uploading logo:', error);
      throw error;
    }
  };
  
  const handleSave = async () => {
    if (!name) {
      toast.error("اسم الشركة مطلوب");
      return;
    }
    
    try {
      setSaving(true);
      
      let updatedLogoUrl = logoUrl;
      if (imageFile) {
        updatedLogoUrl = await uploadLogo(imageFile);
      }
      
      const { error } = await supabase
        .from("companies")
        .update({
          name,
          description,
          address,
          contact_phone: contactPhone,
          contact_email: contactEmail,
          logo_url: updatedLogoUrl
        })
        .eq("id", id!);
        
      if (error) throw error;
      
      toast.success("تم حفظ بيانات الشركة بنجاح");
      setImageFile(null);
      setImagePreview(null);
      
    } catch (error) {
      console.error("Error updating company:", error);
      toast.error("حدث خطأ أثناء حفظ بيانات الشركة");
    } finally {
      setSaving(false);
    }
  };
  
  const handleDelete = async () => {
    if (!window.confirm("هل أنت متأكد من حذف هذه الشركة؟")) return;
    
    try {
      setSaving(true);
      
      const { error } = await supabase
        .from("companies")
        .delete()
        .eq("id", id!);
        
      if (error) throw error;
      
      toast.success("تم حذف الشركة بنجاح");
      navigate("/companies");
      
    } catch (error) {
      console.error("Error deleting company:", error);
      toast.error("حدث خطأ أثناء حذف الشركة");
    } finally {
      setSaving(false);
    }
  };
  
  if (loading) {
    return (
      <MainLayout>
        <div className="container py-8">
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </div>
      </MainLayout>
    );
  }
  
  return (
    <MainLayout>
      <div className="container py-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 gap-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              {logoUrl ? (
                <AvatarImage src={logoUrl} alt={name} />
              ) : (
                <AvatarFallback>
                  <Building className="h-6 w-6" />
                </AvatarFallback>
              )}
            </Avatar>
            <div>
              <h1 className="text-2xl font-bold">{name}</h1>
              <p className="text-muted-foreground text-sm">
                {products.length} منتج
              </p>
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button 
              variant="outline"
              onClick={() => navigate("/companies")}
            >
              العودة للقائمة
            </Button>
            
            <Button 
              variant="destructive"
              onClick={handleDelete}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash className="h-4 w-4 mr-2" />
              )}
              حذف الشركة
            </Button>
          </div>
        </div>
        
        <Tabs defaultValue="details">
          <TabsList className="mb-8">
            <TabsTrigger value="details">تفاصيل الشركة</TabsTrigger>
            <TabsTrigger value="products">المنتجات ({products.length})</TabsTrigger>
          </TabsList>
          
          <TabsContent value="details">
            <Card>
              <CardHeader>
                <CardTitle>معلومات الشركة</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="name">اسم الشركة</Label>
                    <Input 
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="أدخل اسم الشركة"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="description">الوصف</Label>
                    <Textarea 
                      id="description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="أدخل وصف الشركة"
                      rows={4}
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="address">العنوان</Label>
                      <Input 
                        id="address"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="أدخل عنوان الشركة"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="contactPhone">رقم الهاتف</Label>
                      <Input 
                        id="contactPhone"
                        value={contactPhone}
                        onChange={(e) => setContactPhone(e.target.value)}
                        placeholder="أدخل رقم الهاتف"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="contactEmail">البريد الإلكتروني</Label>
                      <Input 
                        id="contactEmail"
                        value={contactEmail}
                        onChange={(e) => setContactEmail(e.target.value)}
                        placeholder="أدخل البريد الإلكتروني"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="logo">شعار الشركة</Label>
                      <div className="flex gap-4 mt-1 items-center">
                        <Input
                          id="logo"
                          type="file"
                          accept="image/*"
                          onChange={handleImageChange}
                          className="flex-1"
                        />
                        <div className="h-12 w-12 rounded-md overflow-hidden bg-muted flex items-center justify-center">
                          {(imagePreview || logoUrl) ? (
                            <img 
                              src={imagePreview || logoUrl || ""} 
                              alt={name} 
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <ImageIcon className="h-6 w-6 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex justify-end">
                    <Button 
                      onClick={handleSave}
                      disabled={saving}
                    >
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin ml-2" />
                      ) : (
                        <Save className="h-4 w-4 ml-2" />
                      )}
                      حفظ التغييرات
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="products">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {products.length > 0 ? products.map(product => (
                <Card key={product.id} className="overflow-hidden">
                  <div className="aspect-square bg-muted relative">
                    {product.image_urls && product.image_urls[0] ? (
                      <img 
                        src={product.image_urls[0]} 
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="h-12 w-12 text-muted-foreground" />
                      </div>
                    )}
                    <Badge className="absolute top-2 right-2">
                      {product.price} ج.م
                    </Badge>
                  </div>
                  <CardContent className="p-4">
                    <h3 className="font-semibold truncate">{product.name}</h3>
                    <div className="flex items-center justify-between mt-2">
                      <Badge variant="outline">
                        {product.quantity} في المخزن
                      </Badge>
                      <Button 
                        variant="link" 
                        size="sm"
                        onClick={() => navigate(`/products/${product.id}`)}
                      >
                        تفاصيل
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )) : (
                <div className="col-span-full text-center py-12 bg-muted/30 rounded-lg">
                  <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium">لا توجد منتجات</h3>
                  <p className="text-muted-foreground">
                    لم يتم إضافة أي منتجات لهذه الشركة بعد
                  </p>
                  <Button
                    className="mt-4"
                    onClick={() => navigate('/products/add')}
                  >
                    إضافة منتج
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
