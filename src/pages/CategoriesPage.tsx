
import MainLayout from "@/components/layout/MainLayout";
import MainCategoryList from "@/components/categories/MainCategoryList";
import { useParams } from "react-router-dom";
import SubcategoryList from "@/components/categories/SubcategoryList";
import CategoryDetail from "@/components/categories/CategoryDetail";

export default function CategoriesPage() {
  const { id } = useParams<{ id: string }>();
  
  return (
    <MainLayout>
      <div className="container py-6">
        <h1 className="text-2xl font-bold mb-6">تصنيفات المنتجات</h1>
        
        {!id && (
          // Main categories list
          <MainCategoryList />
        )}
        
        {id && (
          <>
            {/* Show subcategories list for the selected main category */}
            <SubcategoryList />
            
            {/* Show category detail */}
            <CategoryDetail />
          </>
        )}
      </div>
    </MainLayout>
  );
}
