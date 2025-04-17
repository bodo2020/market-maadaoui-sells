
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import CategoriesList from "@/components/categories/CategoriesList";

export default function Categories() {
  return (
    <MainLayout>
      <div className="container mx-auto p-6">
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
      </div>
    </MainLayout>
  );
}
