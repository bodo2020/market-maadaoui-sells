import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
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
import { Plus, Trash2, Edit } from "lucide-react";
import { siteConfig } from "@/config/site";

export default function ProductCollections() {
  const [collections, setCollections] = useState<ProductCollection[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [newCollection, setNewCollection] = useState<Partial<ProductCollection>>({
    title: '',
    description: '',
    products: []
  });
  const [showMultiSelect, setShowMultiSelect] = useState(false);

  useEffect(() => {
    loadCollections();
    loadProducts();
  }, []);

  useEffect(() => {
    if (products.length > 0) {
      setShowMultiSelect(true);
    }
  }, [products]);

  const loadCollections = async () => {
    try {
      const fetchedCollections = await fetchProductCollections();
      setCollections(fetchedCollections || []);
    } catch (error) {
      console.error("Error loading collections:", error);
      toast.error("حدث خطأ أثناء تحميل المجموعات");
    }
  };

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

      const createdCollection = await createProductCollection({
        title: newCollection.title,
        description: newCollection.description || '',
        products: Array.isArray(newCollection.products) ? newCollection.products : [],
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
      const collectionToUpdate = {
        ...collection,
        products: Array.isArray(collection.products) ? collection.products : []
      };
      
      const updatedCollection = await updateProductCollection(collection.id!, collectionToUpdate);
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
      toast.success("تم ��ذف المجموعة بنجاح");
    } catch (error) {
      console.error("Error deleting collection:", error);
      toast.error("حدث خطأ أثناء حذف المجموعة");
    }
  };

  const productOptions = React.useMemo(() => {
    return products && products.length > 0
      ? products.map(p => ({ label: p.name, value: p.id }))
      : [];
  }, [products]);

  return (
    <MainLayout>
      <div className="container mx-auto px-4 py-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">مجموعات المنتجات</h1>
          <Link to="/product-collections/create">
            <Button>
              <Plus className="ml-2" /> إنشاء مجموعة جديدة
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {collections.map((collection) => (
            <Card key={collection.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle>{collection.title}</CardTitle>
                <div className="flex gap-2">
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => navigate(`/product-collections/edit/${collection.id}`)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="destructive" 
                    size="icon" 
                    onClick={() => handleDeleteCollection(collection.id!)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">{collection.description || 'لا يوجد وصف'}</p>
                <div>
                  <h3 className="font-semibold mb-2 text-sm">المنتجات:</h3>
                  <ul className="space-y-1 text-sm">
                    {Array.isArray(collection.products) && collection.products.length > 0 ? (
                      collection.products.map(productId => {
                        const product = products.find(p => p.id === productId);
                        return product ? (
                          <li key={productId} className="text-muted-foreground">
                            {product.name} - {product.price} {siteConfig.currency}
                          </li>
                        ) : null;
                      })
                    ) : (
                      <li className="text-muted-foreground italic">لا توجد منتجات</li>
                    )}
                  </ul>
                </div>
              </CardContent>
            </Card>
          ))}
          
          {collections.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              لا توجد مجموعات منتجات. قم بإنشاء مجموعة جديدة.
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
