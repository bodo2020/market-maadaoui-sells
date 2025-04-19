
import { useState } from "react";
import MainLayout from "@/components/layout/MainLayout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import BarcodeScanner from "@/components/POS/BarcodeScanner";
import InventoryFilters from "@/components/inventory/InventoryFilters";
import InventoryTable from "@/components/inventory/InventoryTable";
import { useInventoryManagement } from "@/hooks/useInventoryManagement";

export default function InventoryManagement() {
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const {
    products,
    loading,
    categories,
    subcategories,
    subsubcategories,
    mainCategories,
    companies,
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    selectedSubcategory,
    setSelectedSubcategory,
    selectedSubsubcategory,
    setSelectedSubsubcategory,
    selectedMainCategory,
    setSelectedMainCategory,
    selectedCompany,
    setSelectedCompany,
    sortField,
    setSortField,
    sortOrder,
    setSortOrder,
    statusFilter,
    setStatusFilter,
    clearFilters
  } = useInventoryManagement();

  const handleBarcodeScanned = (barcode: string) => {
    setSearchQuery(barcode);
    setIsScannerOpen(false);
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "N/A";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString();
    } catch (error) {
      return "Invalid Date";
    }
  };

  return (
    <MainLayout>
      <div className="container mx-auto p-6 dir-rtl">
        <h1 className="text-2xl font-bold mb-4">إدارة المخزون</h1>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>قائمة المنتجات</CardTitle>
            <CardDescription>عرض وتعديل المنتجات في المخزون</CardDescription>
          </CardHeader>
          <CardContent>
            <InventoryFilters 
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onBarcodeClick={() => setIsScannerOpen(true)}
              statusFilter={statusFilter}
              onStatusChange={setStatusFilter}
              companies={companies}
              selectedCompany={selectedCompany}
              onCompanyChange={value => setSelectedCompany(value === "all" ? null : value)}
              categories={categories}
              selectedCategory={selectedCategory}
              onCategoryChange={setSelectedCategory}
              subcategories={subcategories}
              selectedSubcategory={selectedSubcategory}
              onSubcategoryChange={setSelectedSubcategory}
              subsubcategories={subsubcategories}
              selectedSubsubcategory={selectedSubsubcategory}
              onSubsubcategoryChange={setSelectedSubsubcategory}
              mainCategories={mainCategories}
              selectedMainCategory={selectedMainCategory}
              onMainCategoryChange={setSelectedMainCategory}
              onClearFilters={clearFilters}
              sortField={sortField}
              onSortFieldChange={setSortField}
              sortOrder={sortOrder}
              onSortOrderChange={setSortOrder}
            />

            <div className="mt-6">
              <InventoryTable 
                products={products}
                loading={loading}
                categories={categories}
                formatDate={formatDate}
              />
            </div>
          </CardContent>
        </Card>

        <BarcodeScanner 
          isOpen={isScannerOpen}
          onClose={() => setIsScannerOpen(false)}
          onScan={handleBarcodeScanned}
        />
      </div>
    </MainLayout>
  );
}
