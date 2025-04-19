
import MainLayout from "@/components/layout/MainLayout";
import MainCategoryList from "@/components/categories/MainCategoryList";
import { useParams, useLocation } from "react-router-dom";
import SubcategoryList from "@/components/categories/SubcategoryList";
import SubsubcategoriesList from "@/components/categories/SubsubcategoriesList";
import CategoryDetail from "@/components/categories/CategoryDetail";
import { useEffect, useState } from "react";
import { fetchSubsubcategoryById, fetchSubcategoryById } from "@/services/supabase/categoryService";
import SubsubcategoryProducts from "@/components/categories/SubsubcategoryProducts";

export default function CategoriesPage() {
  const { id, subId } = useParams<{ id: string; subId: string }>();
  const location = useLocation();
  const [subcategoryId, setSubcategoryId] = useState<string | null>(null);
  const [showingSubsubcategoryProducts, setShowingSubsubcategoryProducts] = useState(false);
  
  // Check if we're on the subsubcategory route
  const isSubsubcategoryRoute = location.pathname.includes('/subsubcategories/');
  
  useEffect(() => {
    const fetchParentSubcategory = async () => {
      if (isSubsubcategoryRoute && id) {
        try {
          // If we're on a subsubcategory route, we need to fetch its parent subcategory
          const subsubcategory = await fetchSubsubcategoryById(id);
          if (subsubcategory && subsubcategory.subcategory_id) {
            setSubcategoryId(subsubcategory.subcategory_id);
            setShowingSubsubcategoryProducts(true);
            
            // Get the parent category of the subcategory
            const subcategory = await fetchSubcategoryById(subsubcategory.subcategory_id);
            if (subcategory) {
              // We now have the full hierarchy
              console.log("Hierarchy established", {
                categoryId: subcategory.category_id,
                subcategoryId: subsubcategory.subcategory_id,
                subsubcategoryId: id
              });
            }
          }
        } catch (error) {
          console.error("Error fetching subsubcategory parent:", error);
        }
      }
    };
    
    if (isSubsubcategoryRoute) {
      fetchParentSubcategory();
    } else if (subId) {
      // If we have a subId directly from params
      setSubcategoryId(subId);
      setShowingSubsubcategoryProducts(false);
    }
  }, [id, subId, isSubsubcategoryRoute]);
  
  return (
    <MainLayout>
      <div className="container py-6">
        <h1 className="text-2xl font-bold mb-6">تصنيفات المنتجات</h1>
        
        {isSubsubcategoryRoute && id && subcategoryId && (
          // Show subsubcategories list with the selected subsubcategory
          <SubsubcategoriesList subcategoryId={subcategoryId} selectedSubsubcategoryId={id} />
        )}
        
        {!isSubsubcategoryRoute && id && !subId && (
          // Subcategories list for a specific main category
          <SubcategoryList categoryId={id} />
        )}
        
        {!isSubsubcategoryRoute && id && subId && (
          // Subsubcategories list for a specific subcategory
          <SubsubcategoriesList subcategoryId={subId} />
        )}
        
        {/* Render CategoryDetail only if we're not showing subsubcategory products */}
        {id && !showingSubsubcategoryProducts && !isSubsubcategoryRoute && (
          <CategoryDetail />
        )}
      </div>
    </MainLayout>
  );
}
