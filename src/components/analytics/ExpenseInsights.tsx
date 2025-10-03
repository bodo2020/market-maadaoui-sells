import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, Receipt } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getDateRangeFromPeriod, PeriodType } from "./PeriodFilter";

interface ExpenseInsightsProps {
  selectedPeriod: PeriodType;
}

const ExpenseInsights = ({ selectedPeriod }: ExpenseInsightsProps) => {
  const [insights, setInsights] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    try {
      const dateRange = getDateRangeFromPeriod(selectedPeriod);
      
      const { data: expenses, error: expensesError } = await supabase
        .from('expenses')
        .select('*')
        .gte('date', dateRange.from?.toISOString())
        .lte('date', dateRange.to?.toISOString());

      if (expensesError) throw expensesError;

      const { data: sales, error: salesError } = await supabase
        .from('sales')
        .select('*')
        .gte('date', dateRange.from?.toISOString())
        .lte('date', dateRange.to?.toISOString());

      if (salesError) throw salesError;

      const { data, error } = await supabase.functions.invoke('analyze-data', {
        body: {
          analyticsData: {
            expenses,
            sales,
            period: selectedPeriod
          },
          analysisType: 'expenses'
        }
      });

      if (error) throw error;
      
      setInsights(data.insights);
      toast.success("تم التحليل بنجاح!");
    } catch (error) {
      console.error('Error analyzing data:', error);
      toast.error("حدث خطأ أثناء التحليل");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              تحليل المصروفات وتوصيات التوفير
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
            <Alert className="bg-primary/5 border-primary/20">
              <Sparkles className="h-4 w-4 text-primary" />
              <AlertDescription className="text-right whitespace-pre-wrap mt-2">
                {insights}
              </AlertDescription>
            </Alert>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Receipt className="h-16 w-16 mx-auto mb-4 opacity-20" />
              <p>اضغط على زر "تحليل بالذكاء الاصطناعي" للحصول على:</p>
              <ul className="mt-4 space-y-2 text-sm">
                <li>• تحليل أنماط المصروفات</li>
                <li>• المصروفات الزائدة</li>
                <li>• فرص التوفير</li>
                <li>• ميزانية الإعلانات المقترحة</li>
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ExpenseInsights;
