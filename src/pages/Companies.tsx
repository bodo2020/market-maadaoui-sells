
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Building2, Plus, PenSquare, Trash2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import CompanyForm from "@/components/companies/CompanyForm";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Company, fetchCompanies, deleteCompany } from "@/services/supabase/companyService";

export default function Companies() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);

  useEffect(() => {
    fetchCompaniesList();
  }, []);

  const fetchCompaniesList = async () => {
    try {
      setLoading(true);
      const data = await fetchCompanies();
      console.log("Companies data:", data);
      setCompanies(data || []);
    } catch (error) {
      console.error('Error fetching companies:', error);
      toast.error("حدث خطأ أثناء تحميل بيانات الشركات");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedCompany) return;

    try {
      setLoading(true);
      await deleteCompany(selectedCompany.id);
      toast.success("تم حذف الشركة بنجاح");
      fetchCompaniesList();
    } catch (error) {
      console.error('Error deleting company:', error);
      toast.error("حدث خطأ أثناء حذف الشركة");
    } finally {
      setLoading(false);
      setIsDeleteDialogOpen(false);
      setSelectedCompany(null);
    }
  };

  const filteredCompanies = companies.filter(company => 
    company.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <MainLayout>
      <div className="container mx-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">الشركات</h1>
          <Button onClick={() => setIsAddDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            إضافة شركة جديدة
          </Button>
        </div>

        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <Input 
              className="pl-10 pr-4" 
              placeholder="البحث عن شركة..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        
        {loading ? (
          <p className="text-center">جاري التحميل...</p>
        ) : filteredCompanies.length === 0 ? (
          <div className="text-center py-10">
            <Building2 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-xl text-gray-500">
              {searchQuery ? "لا توجد نتائج للبحث" : "لا توجد شركات حالياً"}
            </p>
            {searchQuery && (
              <Button 
                variant="link" 
                onClick={() => setSearchQuery("")}
                className="mt-2"
              >
                إظهار كل الشركات
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCompanies.map((company) => (
              <Card key={company.id} className="overflow-hidden">
                <CardContent className="p-6">
                  <div className="aspect-square w-full relative mb-4">
                    {company.logo_url ? (
                      <img 
                        src={company.logo_url}
                        alt={company.name}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gray-100 rounded-lg">
                        <Building2 className="w-16 h-16 text-gray-400" />
                      </div>
                    )}
                  </div>
                  <h3 className="text-xl font-semibold text-center">{company.name}</h3>
                  {company.description && (
                    <p className="text-gray-500 text-center mt-2 line-clamp-2">{company.description}</p>
                  )}
                  <div className="flex justify-center mt-4 gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        setSelectedCompany(company);
                        setIsEditDialogOpen(true);
                      }}
                    >
                      <PenSquare className="h-4 w-4 mr-1" />
                      تعديل
                    </Button>
                    <Button 
                      variant="destructive" 
                      size="sm"
                      onClick={() => {
                        setSelectedCompany(company);
                        setIsDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      حذف
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Add Company Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>إضافة شركة جديدة</DialogTitle>
          </DialogHeader>
          <CompanyForm 
            onSaved={() => {
              setIsAddDialogOpen(false);
              fetchCompaniesList();
            }}
            onCancel={() => setIsAddDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Company Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>تعديل الشركة</DialogTitle>
          </DialogHeader>
          {selectedCompany && (
            <CompanyForm 
              company={selectedCompany}
              onSaved={() => {
                setIsEditDialogOpen(false);
                setSelectedCompany(null);
                fetchCompaniesList();
              }}
              onCancel={() => {
                setIsEditDialogOpen(false);
                setSelectedCompany(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>هل أنت متأكد؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف الشركة وجميع بياناتها. هذا الإجراء لا يمكن التراجع عنه.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setIsDeleteDialogOpen(false);
              setSelectedCompany(null);
            }}>
              إلغاء
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              تأكيد الحذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}
