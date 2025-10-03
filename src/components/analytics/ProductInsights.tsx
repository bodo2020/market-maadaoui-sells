import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, Package, Download } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getDateRangeFromPeriod, PeriodType } from "./PeriodFilter";
import jsPDF from "jspdf";

interface ProductInsightsProps {
  selectedPeriod: PeriodType;
}

const ProductInsights = ({ selectedPeriod }: ProductInsightsProps) => {
  const [insights, setInsights] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    try {
      const dateRange = getDateRangeFromPeriod(selectedPeriod);
      
      // Fetch comprehensive product data
      const { data: products, error: productsError } = await supabase
        .from('products')
        .select('*');

      if (productsError) {
        console.error('Products error:', productsError);
        throw productsError;
      }

      // Fetch inventory data separately
      const { data: inventory, error: inventoryError } = await supabase
        .from('inventory')
        .select('*');

      if (inventoryError) {
        console.error('Inventory error:', inventoryError);
        throw inventoryError;
      }

      // Fetch sales data
      const { data: sales, error: salesError } = await supabase
        .from('sales')
        .select('*')
        .gte('date', dateRange.from?.toISOString())
        .lte('date', dateRange.to?.toISOString());

      if (salesError) {
        console.error('Sales error:', salesError);
        throw salesError;
      }

      const { data, error } = await supabase.functions.invoke('analyze-data', {
        body: {
          analyticsData: {
            products,
            inventory,
            sales,
            period: selectedPeriod
          },
          analysisType: 'products'
        }
      });

      if (error) {
        console.error('Function error:', error);
        throw error;
      }
      
      setInsights(data.insights);
      toast.success("تم التحليل بنجاح!");
    } catch (error) {
      console.error('Error analyzing data:', error);
      toast.error(error?.message || "حدث خطأ أثناء التحليل");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDownloadPDF = () => {
    if (!insights) {
      toast.error("لا توجد تحليلات لتحميلها");
      return;
    }

    const doc = new jsPDF();
    
    // Add Arabic font support
    doc.setFont("helvetica");
    doc.setR2L(true);
    
    // Title
    doc.setFontSize(18);
    doc.text("تحليل المنتجات والتوقعات", 105, 20, { align: "center" });
    
    // Date
    doc.setFontSize(10);
    doc.text(new Date().toLocaleDateString("ar-EG"), 105, 30, { align: "center" });
    
    // Content
    doc.setFontSize(12);
    const lines = doc.splitTextToSize(insights, 180);
    doc.text(lines, 15, 45);
    
    // Save
    doc.save(`تحليل-المنتجات-${new Date().toLocaleDateString("ar-EG")}.pdf`);
    toast.success("تم تحميل الملف بنجاح");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              تحليل المنتجات والتوقعات
            </span>
            <Button 
              onClick={handleAnalyze} 
              disabled={isAnalyzing}
              className="flex items-center gap-2"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جاري التحليل...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  تحليل بالذكاء الاصطناعي
                </>
              )}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {insights ? (
            <div className="space-y-4">
              <Alert className="bg-primary/5 border-primary/20">
                <Sparkles className="h-4 w-4 text-primary" />
                <AlertDescription className="text-right whitespace-pre-wrap mt-2">
                  {insights}
                </AlertDescription>
              </Alert>
              <Button 
                onClick={handleDownloadPDF} 
                variant="outline" 
                className="w-full flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                تحميل كملف PDF
              </Button>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="h-16 w-16 mx-auto mb-4 opacity-20" />
              <p>اضغط على زر "تحليل بالذكاء الاصطناعي" للحصول على:</p>
              <ul className="mt-4 space-y-2 text-sm">
                <li>• توقعات الطلب على المنتجات</li>
                <li>• المنتجات التي تحتاج زيادة الكمية</li>
                <li>• المنتجات البطيئة الحركة</li>
                <li>• توصيات لتحسين الأرباح</li>
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ProductInsights;
