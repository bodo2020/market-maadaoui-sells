
import MainLayout from "@/components/layout/MainLayout";
import { useParams } from "react-router-dom";
import SubcategoryProducts from "@/components/categories/SubcategoryProducts";
import { fetchSubcategoryById } from "@/services/supabase/categoryService";
import { useState, useEffect } from "react";
import { Subcategory } from "@/types";
import { Loader2 } from "lucide-react";

export default function SubcategoryPage() {
  const { subId } = useParams<{ subId: string }>();
  const [subcategory, setSubcategory] = useState<Subcategory | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSubcategory = async () => {
      if (!subId) return;
      try {
        const data = await fetchSubcategoryById(subId);
        setSubcategory(data);
      } catch (error) {
        console.error("Error loading subcategory:", error);
      } finally {
        setLoading(false);
      }
    };

    loadSubcategory();
  }, [subId]);

  if (loading) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </MainLayout>
    );
  }

  if (!subcategory) {
    return (
      <MainLayout>
        <div className="container py-6">
          <p className="text-center text-red-500">لم يتم العثور على القسم الفرعي</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="container py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">{subcategory.name}</h1>
          {subcategory.description && (
            <p className="text-gray-600 mt-2">{subcategory.description}</p>
          )}
        </div>
        
        <SubcategoryProducts subcategoryId={subId} />
      </div>
    </MainLayout>
  );
}
