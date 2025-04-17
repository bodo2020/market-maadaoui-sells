import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, Package, Plus, Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Company, Product } from "@/types";
import { fetchCompanyById } from "@/services/supabase/companyService";
import { fetchProductsByCompany } from "@/services/supabase/productService";
import { ProductGrid } from "@/components/products/ProductGrid";
import { AddProductDialog } from "@/components/products/AddProductDialog";

export default function CompanyDetails() {
  const {
    id
  } = useParams();
  const navigate = useNavigate();
  const [company, setCompany] = useState<Company | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddProductDialogOpen, setIsAddProductDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [selectedSubsubcategory, setSelectedSubsubcategory] = useState<string | null>(null);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [subcategories, setSubcategories] = useState<Array<{ id: string; name: string }>>([]);
  const [subsubcategories, setSubsubcategories] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    if (id) {
      loadCompanyDetails(id);
    }
  }, [id]);

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    if (selectedCategory) {
      fetchSubcategories(selectedCategory);
    } else {
      setSubcategories([]);
      setSelectedSubcategory(null);
    }
  }, [selectedCategory]);

  useEffect(() => {
    if (selectedSubcategory) {
      fetchSubsubcategories(selectedSubcategory);
    } else {
      setSubsubcategories([]);
      setSelectedSubsubcategory(null);
    }
  }, [selectedSubcategory]);

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name')
        .eq('level', 'category')
        .order('name');
      
      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
      toast.error('حدث خطأ أثناء تحميل الأقسام');
    }
  };

  const fetchSubcategories = async (categoryId: string) => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name')
        .eq('level', 'subcategory')
        .eq('parent_id', categoryId)
        .order('name');
      
      if (error) throw error;
      setSubcategories(data || []);
    } catch (error) {
      console.error('Error fetching subcategories:', error);
      toast.error('حدث خطأ أثناء تحميل الأقسام الفرعية');
    }
  };

  const fetchSubsubcategories = async (subcategoryId: string) => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name')
        .eq('level', 'subsubcategory')
        .eq('parent_id', subcategoryId)
        .order('name');
      
      if (error) throw error;
      setSubsubcategories(data || []);
    } catch (error) {
      console.error('Error fetching subsubcategories:', error);
      toast.error('حدث خطأ أثناء تحميل الفئات');
    }
  };

  const handleCategoryChange = (categoryId: string | null) => {
    setSelectedCategory(categoryId);
    setSelectedSubcategory(null);
    setSelectedSubsubcategory(null);
  };

  const handleSubcategoryChange = (subcategoryId: string | null) => {
    setSelectedSubcategory(subcategoryId);
    setSelectedSubsubcategory(null);
  };

  const handleAddProduct = () => {
    setIsAddProductDialogOpen(true);
  };

  const handleEditProduct = (product: Product) => {
    navigate(`/add-product?id=${product.id}`);
  };

  const filteredProducts = products.filter(product => {
    if (!searchQuery) {
      if (selectedSubsubcategory) {
        return product.subsubcategory_id === selectedSubsubcategory;
      }
      if (selectedSubcategory) {
        return product.subcategory_id === selectedSubcategory;
      }
      if (selectedCategory) {
        return product.category_id === selectedCategory;
      }
      return true;
    }
    return product.name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const loadCompanyDetails = async (companyId: string) => {
    try {
      setLoading(true);
      const companyData = await fetchCompanyById(companyId);
      setCompany(companyData);
      const productsData = await fetchProductsByCompany(companyId);
      setProducts(productsData);
    } catch (error) {
      console.error("Error loading company details:", error);
      toast.error("حدث خطأ أثناء تحميل بيانات الشركة");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <MainLayout>
        <div className="flex justify-center items-center h-[70vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>;
  }

  if (!company) {
    return <MainLayout>
        <div className="flex flex-col items-center justify-center h-[70vh]">
          <Building2 className="h-16 w-16 text-gray-400 mb-4" />
          <h2 className="text-xl font-medium text-gray-600">الشركة غير موجودة</h2>
          <Button variant="link" onClick={() => navigate("/companies")} className="mt-4">
            العودة إلى الشركات
          </Button>
        </div>
      </MainLayout>;
  }

  return <MainLayout>
      <div className="container mx-auto p-6">
        <div className="flex items-start gap-6 mb-6">
          <div className="w-32 h-32 rounded-lg border overflow-hidden flex-shrink-0 bg-white flex items-center justify-center">
            {company.logo_url ? <img src={company.logo_url} alt={company.name} className="w-full h-full object-contain p-2" /> : <Building2 className="h-16 w-16 text-gray-400" />}
          </div>
          
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{company.name}</h1>
            {company.description && <p className="text-gray-600 mt-2">{company.description}</p>}
            <div className="flex flex-wrap gap-4 mt-4">
              {company.contact_email && <div className="text-sm">
                  <span className="font-medium">البريد الإلكتروني:</span> {company.contact_email}
                </div>}
              {company.contact_phone && <div className="text-sm">
                  <span className="font-medium">رقم الهاتف:</span> {company.contact_phone}
                </div>}
              {company.address && <div className="text-sm">
                  <span className="font-medium">العنوان:</span> {company.address}
                </div>}
            </div>
          </div>
        </div>

        <Tabs defaultValue="products" className="w-full mt-6">
          <TabsList className="w-full max-w-md">
            <TabsTrigger value="products" className="flex-1">
              <Package className="mr-2 h-4 w-4" />
              منتجات الشركة
            </TabsTrigger>
            <TabsTrigger value="info" className="flex-1">
              <Building2 className="mr-2 h-4 w-4" />
              معلومات الشركة
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="products" className="mt-6">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>منتجات {company?.name}</CardTitle>
                    <CardDescription>قائمة المنتجات المرتبطة بالشركة</CardDescription>
                  </div>
                  <Button onClick={handleAddProduct}>
                    <Plus className="h-4 w-4 ml-2" />
                    إضافة منتج
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-4">
                    <select
                      className="p-2 border rounded-md flex-1"
                      value={selectedCategory || ''}
                      onChange={(e) => handleCategoryChange(e.target.value || null)}
                    >
                      <option value="">كل الأقسام</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>

                    {selectedCategory && (
                      <select
                        className="p-2 border rounded-md flex-1"
                        value={selectedSubcategory || ''}
                        onChange={(e) => handleSubcategoryChange(e.target.value || null)}
                      >
                        <option value="">كل الأقسام الفرعية</option>
                        {subcategories.map((subcategory) => (
                          <option key={subcategory.id} value={subcategory.id}>
                            {subcategory.name}
                          </option>
                        ))}
                      </select>
                    )}

                    {selectedSubcategory && (
                      <select
                        className="p-2 border rounded-md flex-1"
                        value={selectedSubsubcategory || ''}
                        onChange={(e) => setSelectedSubsubcategory(e.target.value || null)}
                      >
                        <option value="">كل الفئات</option>
                        {subsubcategories.map((subsubcategory) => (
                          <option key={subsubcategory.id} value={subsubcategory.id}>
                            {subsubcategory.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Input 
                      placeholder="البحث عن منتج..." 
                      value={searchQuery} 
                      onChange={e => setSearchQuery(e.target.value)} 
                      className="max-w-sm" 
                    />
                    <Button variant="outline">
                      <Search className="ml-2 h-4 w-4" />
                      بحث
                    </Button>
                  </div>
                
                  <ProductGrid products={filteredProducts} onEditProduct={handleEditProduct} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="info">
            <Card>
              <CardHeader>
                <CardTitle>معلومات الشركة</CardTitle>
                <CardDescription>بيانات تفصيلية عن الشركة</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="font-medium mb-1">الاسم</h3>
                  <p>{company.name}</p>
                </div>
                {company.description && <div>
                    <h3 className="font-medium mb-1">الوصف</h3>
                    <p>{company.description}</p>
                  </div>}
                {company.address && <div>
                    <h3 className="font-medium mb-1">العنوان</h3>
                    <p>{company.address}</p>
                  </div>}
                {company.contact_email && <div>
                    <h3 className="font-medium mb-1">البريد الإلكتروني</h3>
                    <p>{company.contact_email}</p>
                  </div>}
                {company.contact_phone && <div>
                    <h3 className="font-medium mb-1">رقم الهاتف</h3>
                    <p>{company.contact_phone}</p>
                  </div>}
                <div className="pt-4">
                  <Button onClick={() => navigate(`/companies?edit=${company.id}`)}>
                    تعديل بيانات الشركة
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <AddProductDialog 
          isOpen={isAddProductDialogOpen} 
          onClose={() => setIsAddProductDialogOpen(false)} 
          onProductAdded={() => loadCompanyDetails(company?.id || '')} 
          companyId={company?.id || ''}
          categories={categories}
          subcategories={subcategories}
          subsubcategories={subsubcategories}
          selectedCategory={selectedCategory}
          selectedSubcategory={selectedSubcategory}
          selectedSubsubcategory={selectedSubsubcategory}
          onCategoryChange={handleCategoryChange}
          onSubcategoryChange={handleSubcategoryChange}
          onSubsubcategoryChange={setSelectedSubsubcategory}
        />
      </div>
    </MainLayout>;
}
