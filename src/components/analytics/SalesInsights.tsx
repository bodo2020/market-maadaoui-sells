import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, TrendingUp, Download } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getDateRangeFromPeriod, PeriodType } from "./PeriodFilter";
import jsPDF from "jspdf";

interface SalesInsightsProps {
  selectedPeriod: PeriodType;
}

const SalesInsights = ({ selectedPeriod }: SalesInsightsProps) => {
  const [insights, setInsights] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    try {
      const dateRange = getDateRangeFromPeriod(selectedPeriod);
      
      const { data: sales, error: salesError } = await supabase
        .from('sales')
        .select('*')
        .gte('date', dateRange.from?.toISOString())
        .lte('date', dateRange.to?.toISOString());

      if (salesError) {
        console.error('Sales error:', salesError);
        throw salesError;
      }

      const { data: offers, error: offersError } = await supabase
        .from('banners')
        .select('*')
        .eq('active', true);

      if (offersError) {
        console.error('Offers error:', offersError);
        throw offersError;
      }

      const { data, error } = await supabase.functions.invoke('analyze-data', {
        body: {
          analyticsData: {
            sales,
            offers,
            period: selectedPeriod
          },
          analysisType: 'sales'
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
    doc.setFont("helvetica");
    doc.setR2L(true);
    doc.setFontSize(18);
    doc.text("تحليل المبيعات والعروض", 105, 20, { align: "center" });
    doc.setFontSize(10);
    doc.text(new Date().toLocaleDateString("ar-EG"), 105, 30, { align: "center" });
    doc.setFontSize(12);
    const lines = doc.splitTextToSize(insights, 180);
    doc.text(lines, 15, 45);
    doc.save(`تحليل-المبيعات-${new Date().toLocaleDateString("ar-EG")}.pdf`);
    toast.success("تم تحميل الملف بنجاح");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              تحليل المبيعات والعروض
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
              <TrendingUp className="h-16 w-16 mx-auto mb-4 opacity-20" />
              <p>اضغط على زر "تحليل بالذكاء الاصطناعي" للحصول على:</p>
              <ul className="mt-4 space-y-2 text-sm">
                <li>• تحليل أداء المبيعات</li>
                <li>• فعالية العروض الحالية</li>
                <li>• أفضل أوقات البيع</li>
                <li>• توصيات لزيادة المبيعات</li>
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SalesInsights;
