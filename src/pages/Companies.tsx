
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Building2 } from "lucide-react";

interface Company {
  id: string;
  name: string;
  logo_url: string | null;
}

export default function Companies() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('companies')
        .select('id, name, logo_url')
        .order('name');

      if (error) throw error;
      setCompanies(data || []);
    } catch (error) {
      console.error('Error fetching companies:', error);
      toast.error("حدث خطأ أثناء تحميل بيانات الشركات");
    } finally {
      setLoading(false);
    }
  };

  return (
    <MainLayout>
      <div className="container mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">الشركات</h1>
        
        {loading ? (
          <p className="text-center">جاري التحميل...</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {companies.map((company) => (
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
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
