
import MainLayout from "@/components/layout/MainLayout";
import MainCategoryList from "@/components/categories/MainCategoryList";

export default function Categories() {
  return (
    <MainLayout>
      <div className="container py-6">
        <h1 className="text-2xl font-bold mb-6">تصنيفات المنتجات</h1>
        <MainCategoryList />
      </div>
    </MainLayout>
  );
}
