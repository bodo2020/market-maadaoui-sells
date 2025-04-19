
import MainLayout from "@/components/layout/MainLayout";
import MainCategoryList from "@/components/categories/MainCategoryList";
import { useParams } from "react-router-dom";
import SubcategoryList from "@/components/categories/SubcategoryList";
import SubsubcategoriesList from "@/components/categories/SubsubcategoriesList";
import CategoryDetail from "@/components/categories/CategoryDetail";

export default function CategoriesPage() {
  const { id, subId } = useParams<{ id: string; subId: string }>();
  
  return (
    <MainLayout>
      <div className="container py-6">
        <h1 className="text-2xl font-bold mb-6">تصنيفات المنتجات</h1>
        
        {id && !subId && (
          // Subcategories list for a specific main category
          <SubcategoryList categoryId={id} />
        )}
        
        {id && subId && (
          // Subsubcategories list for a specific subcategory
          <SubsubcategoriesList subcategoryId={subId} />
        )}
        
        {/* Render CategoryDetail when needed */}
        {id && (
          <CategoryDetail />
        )}
      </div>
    </MainLayout>
  );
}
