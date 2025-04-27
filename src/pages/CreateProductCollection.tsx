import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import MainLayout from "@/components/layout/MainLayout";
import { fetchProducts } from "@/services/supabase/productService";
import { createProductCollection } from "@/services/supabase/productCollectionsService";
import { Product } from "@/types";
import { Plus, X } from "lucide-react";
import { siteConfig } from "@/config/site";

export default function CreateProductCollection() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newCollection, setNewCollection] = useState({
    title: '',
    description: '',
    products: [] as string[]
  });

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      const fetchedProducts = await fetchProducts();
      setProducts(fetchedProducts || []);
    } catch (error) {
      console.error("Error loading products:", error);
      toast.error("حدث خطأ أثناء تحميل المنتجات");
    }
  };

  const handleCreateCollection = async () => {
    try {
      if (!newCollection.title) {
        toast.error("العنوان مطلوب");
        return;
      }

      setIsSubmitting(true);
      
      await createProductCollection({
        title: newCollection.title,
        description: newCollection.description || '',
        products: selectedProducts,
        position: 0,
        active: true
      });

      toast.success("تم إنشاء المجموعة بنجاح");
      navigate('/product-collections');
    } catch (error) {
      console.error("Error creating collection:", error);
      toast.error("حدث خطأ أثناء إنشاء المجموعة");
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredProducts = products.filter(product => 
    product.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
    !selectedProducts.includes(product.id)
  );

  const selectedProductDetails = products.filter(product => 
    selectedProducts.includes(product.id)
  );

  const addProduct = (productId: string) => {
    setSelectedProducts([...selectedProducts, productId]);
  };

  const removeProduct = (productId: string) => {
    setSelectedProducts(selectedProducts.filter(id => id !== productId));
  };

  return (
    <MainLayout>
      <div className="container mx-auto px-4 py-6">
        <div className="flex justify-between items-center mb-6">
          <Button variant="outline" onClick={() => navigate('/product-collections')}>
            رجوع
          </Button>
          <h1 className="text-2xl font-bold">إضافة مجموعة جديدة</h1>
        </div>

        <Card className="max-w-4xl mx-auto">
          <CardHeader>
            <CardTitle>عنوان المجموعة</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="space-y-2">
                <Input
                  placeholder="أدخل عنوان المجموعة"
                  value={newCollection.title}
                  onChange={(e) => setNewCollection({...newCollection, title: e.target.value})}
                />
              </div>

              <div className="space-y-2">
                <Input
                  placeholder="وصف المجموعة (اختياري)"
                  value={newCollection.description}
                  onChange={(e) => setNewCollection({...newCollection, description: e.target.value})}
                />
              </div>

              <div className="space-y-4">
                <h3 className="font-semibold">إضافة منتجات للمجموعة</h3>
                <p className="text-sm text-muted-foreground">المنتجات المختارة ({selectedProducts.length})</p>
                
                <div className="space-y-2">
                  {selectedProductDetails.map(product => (
                    <div key={product.id} className="flex items-center justify-between p-3 border rounded-lg bg-muted/50">
                      <div className="flex items-center gap-3">
                        {product.image_urls?.[0] && (
                          <img 
                            src={product.image_urls[0]} 
                            alt={product.name} 
                            className="w-12 h-12 object-cover rounded"
                          />
                        )}
                        <div>
                          <p className="font-medium">{product.name}</p>
                          <p className="text-sm text-muted-foreground">{product.price} {siteConfig.currency}</p>
                        </div>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => removeProduct(product.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <Input
                    placeholder="ابحث عن منتج"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <div className="max-h-[300px] overflow-y-auto space-y-2">
                    {filteredProducts.map(product => (
                      <div key={product.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          {product.image_urls?.[0] && (
                            <img 
                              src={product.image_urls[0]} 
                              alt={product.name} 
                              className="w-12 h-12 object-cover rounded"
                            />
                          )}
                          <div>
                            <p className="font-medium">{product.name}</p>
                            <p className="text-sm text-muted-foreground">{product.price} {siteConfig.currency}</p>
                          </div>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => addProduct(product.id)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-4">
                <Button onClick={() => navigate('/product-collections')}>
                  إلغاء
                </Button>
                <Button 
                  onClick={handleCreateCollection} 
                  className="mr-4"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'جاري الحفظ...' : 'حفظ'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
