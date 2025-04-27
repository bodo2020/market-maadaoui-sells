
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { MultiSelect } from "@/components/ui/multi-select";
import MainLayout from "@/components/layout/MainLayout";
import { fetchProducts } from "@/services/supabase/productService";
import { createProductCollection } from "@/services/supabase/productCollectionsService";
import { Product } from "@/types";

export default function CreateProductCollection() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [newCollection, setNewCollection] = useState<{
    title: string;
    description: string;
    products: string[];
  }>({
    title: '',
    description: '',
    products: []
  });
  const [showMultiSelect, setShowMultiSelect] = useState(false);

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    if (products.length > 0) {
      setShowMultiSelect(true);
    }
  }, [products]);

  const loadProducts = async () => {
    try {
      const fetchedProducts = await fetchProducts();
      setProducts(fetchedProducts || []);
    } catch (error) {
      console.error("Error loading products:", error);
      toast.error("حدث خطأ أثناء تحميل المنتجات");
    }
  };

  const productOptions = React.useMemo(() => {
    return products && products.length > 0
      ? products.map(p => ({ label: p.name, value: p.id }))
      : [];
  }, [products]);

  const handleCreateCollection = async () => {
    try {
      if (!newCollection.title) {
        toast.error("العنوان مطلوب");
        return;
      }

      await createProductCollection({
        title: newCollection.title,
        description: newCollection.description || '',
        products: Array.isArray(newCollection.products) ? newCollection.products : [],
        position: 0,
        active: true
      });

      toast.success("تم إنشاء المجموعة بنجاح");
      navigate('/product-collections');
    } catch (error) {
      console.error("Error creating collection:", error);
      toast.error("حدث خطأ أثناء إنشاء المجموعة");
    }
  };

  return (
    <MainLayout>
      <div className="container mx-auto px-4 py-6">
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>إنشاء مجموعة جديدة</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="title" className="block text-sm font-medium">
                  اسم المجموعة
                </label>
                <Input
                  id="title"
                  placeholder="اسم المجموعة"
                  value={newCollection.title}
                  onChange={(e) => setNewCollection({...newCollection, title: e.target.value})}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="description" className="block text-sm font-medium">
                  وصف المجموعة (اختياري)
                </label>
                <Input
                  id="description"
                  placeholder="وصف المجموعة"
                  value={newCollection.description}
                  onChange={(e) => setNewCollection({...newCollection, description: e.target.value})}
                />
              </div>

              {showMultiSelect && productOptions.length > 0 && (
                <div className="space-y-2">
                  <label htmlFor="products" className="block text-sm font-medium">
                    اختر المنتجات
                  </label>
                  <MultiSelect
                    options={productOptions}
                    value={Array.isArray(newCollection.products) ? newCollection.products : []}
                    onChange={(selected) => setNewCollection({...newCollection, products: selected})}
                    placeholder="اختر المنتجات"
                  />
                </div>
              )}

              <div className="flex justify-end space-x-4">
                <Button variant="outline" onClick={() => navigate('/product-collections')}>
                  إلغاء
                </Button>
                <Button onClick={handleCreateCollection}>
                  إنشاء المجموعة
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
