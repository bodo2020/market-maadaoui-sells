
import { useParams } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import CategoriesList from "@/components/categories/CategoriesList";
import CategoryDetail from "@/components/categories/CategoryDetail";

export default function Categories() {
  const { id } = useParams<{ id: string }>();

  return (
    <MainLayout>
      <div className="container mx-auto p-6">
        {id ? (
          <CategoryDetail />
        ) : (
          <>
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-2xl font-bold">إدارة التصنيفات</h1>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>التصنيفات</CardTitle>
              </CardHeader>
              <CardContent>
                <CategoriesList />
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </MainLayout>
  );
}
