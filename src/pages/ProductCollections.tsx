
import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { 
  ProductCollection, 
  fetchProductCollections, 
  createProductCollection, 
  updateProductCollection, 
  deleteProductCollection 
} from "@/services/supabase/productCollectionsService";
import { fetchProducts } from "@/services/supabase/productService";
import { Product } from "@/types";
import { MultiSelect } from "@/components/ui/multi-select";
import MainLayout from "@/components/layout/MainLayout";

export default function ProductCollections() {
  const [collections, setCollections] = useState<ProductCollection[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [newCollection, setNewCollection] = useState<Partial<ProductCollection>>({
    title: '',
    description: '',
    products: []
  });

  useEffect(() => {
    loadCollections();
    loadProducts();
  }, []);

  const loadCollections = async () => {
    try {
      const fetchedCollections = await fetchProductCollections();
      setCollections(fetchedCollections);
    } catch (error) {
      console.error("Error loading collections:", error);
      toast.error("حدث خطأ أثناء تحميل المجموعات");
    }
  };

  const loadProducts = async () => {
    try {
      const fetchedProducts = await fetchProducts();
      setProducts(fetchedProducts);
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

      const createdCollection = await createProductCollection({
        title: newCollection.title,
        description: newCollection.description || '',
        products: newCollection.products || [],
        position: collections.length,
        active: true
      });

      setCollections([...collections, createdCollection]);
      setNewCollection({ title: '', description: '', products: [] });
      toast.success("تم إنشاء المجموعة بنجاح");
    } catch (error) {
      console.error("Error creating collection:", error);
      toast.error("حدث خطأ أثناء إنشاء المجموعة");
    }
  };

  const handleUpdateCollection = async (collection: ProductCollection) => {
    try {
      const updatedCollection = await updateProductCollection(collection.id!, collection);
      setCollections(collections.map(c => c.id === collection.id ? updatedCollection : c));
      toast.success("تم تحديث المجموعة بنجاح");
    } catch (error) {
      console.error("Error updating collection:", error);
      toast.error("حدث خطأ أثناء تحديث المجموعة");
    }
  };

  const handleDeleteCollection = async (id: string) => {
    try {
      await deleteProductCollection(id);
      setCollections(collections.filter(c => c.id !== id));
      toast.success("تم حذف المجموعة بنجاح");
    } catch (error) {
      console.error("Error deleting collection:", error);
      toast.error("حدث خطأ أثناء حذف المجموعة");
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">مجموعات المنتجات</h1>
        
        <Card>
          <CardHeader>
            <CardTitle>إنشاء مجموعة جديدة</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Input
                placeholder="اسم المجموعة"
                value={newCollection.title || ''}
                onChange={(e) => setNewCollection({...newCollection, title: e.target.value})}
              />
              <Input
                placeholder="وصف المجموعة (اختياري)"
                value={newCollection.description || ''}
                onChange={(e) => setNewCollection({...newCollection, description: e.target.value})}
              />
              <MultiSelect
                options={products.map(p => ({ label: p.name, value: p.id }))}
                value={newCollection.products || []}
                onChange={(selected) => setNewCollection({...newCollection, products: selected})}
                placeholder="اختر المنتجات"
              />
              <Button onClick={handleCreateCollection}>إضافة مجموعة</Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {collections.map((collection) => (
            <Card key={collection.id}>
              <CardHeader>
                <CardTitle>{collection.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p>{collection.description}</p>
                <div className="mt-4">
                  <h3 className="font-semibold mb-2">المنتجات:</h3>
                  <ul>
                    {Array.isArray(collection.products) && collection.products.map(productId => {
                      const product = products.find(p => p.id === productId);
                      return product ? <li key={productId}>{product.name}</li> : null;
                    })}
                  </ul>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button 
                    variant="destructive" 
                    onClick={() => handleDeleteCollection(collection.id!)}
                  >
                    حذف
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </MainLayout>
  );
}
