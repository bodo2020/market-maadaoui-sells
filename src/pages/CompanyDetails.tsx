
import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AddProductDialog } from "@/components/products/AddProductDialog";
import { ProductGrid } from "@/components/products/ProductGrid";
import { Product } from "@/types";

export default function CompanyDetails() {
  const { id } = useParams();
  const [company, setCompany] = useState<any>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCompanyDetails();
  }, [id]);

  const fetchCompanyDetails = async () => {
    try {
      setLoading(true);
      
      // Fetch company details
      const { data: companyData, error: companyError } = await supabase
        .from("companies")
        .select("*")
        .eq("id", id)
        .single();

      if (companyError) throw companyError;
      setCompany(companyData);

      // Fetch company products
      const { data: productsData, error: productsError } = await supabase
        .from("products")
        .select("*")
        .eq("company_id", id);

      if (productsError) throw productsError;
      setProducts(productsData);
    } catch (error) {
      console.error("Error fetching company details:", error);
      toast.error("Error fetching company details");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center h-[60vh]">
          Loading...
        </div>
      </MainLayout>
    );
  }

  if (!company) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center h-[60vh]">
          Company not found
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="container mx-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold">{company.name}</h1>
            {company.description && (
              <p className="text-gray-600 mt-1">{company.description}</p>
            )}
          </div>
          <Button onClick={() => setIsAddDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Product
          </Button>
        </div>

        {products.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-gray-500">No products added yet</p>
          </div>
        ) : (
          <ProductGrid products={products} />
        )}

        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <AddProductDialog
            companyId={id!}
            onClose={() => setIsAddDialogOpen(false)}
            onSuccess={fetchCompanyDetails}
          />
        </Dialog>
      </div>
    </MainLayout>
  );
}
