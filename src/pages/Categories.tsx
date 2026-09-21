
import { useState } from "react";
import MainLayout from "@/components/layout/MainLayout";
import MainCategoryList from "@/components/categories/MainCategoryList";
import UncategorizedProductsWorkspace from "@/components/categories/UncategorizedProductsWorkspace";

export default function Categories() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <MainLayout>
      <div className="container py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">تصنيفات المنتجات</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            نظّم الأقسام، واستكمل تصنيف المنتجات الناقصة من مكان واحد.
          </p>
        </div>
        <UncategorizedProductsWorkspace
          refreshKey={refreshKey}
          onAssignmentsSaved={() => setRefreshKey((value) => value + 1)}
        />
        <MainCategoryList key={refreshKey} />
      </div>
    </MainLayout>
  );
}
