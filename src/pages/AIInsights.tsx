import { useState } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, Package, TrendingUp, DollarSign, Receipt } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PeriodFilter, getDateRangeFromPeriod, PeriodType } from "@/components/analytics/PeriodFilter";
import ProductInsights from "@/components/analytics/ProductInsights";
import SalesInsights from "@/components/analytics/SalesInsights";
import ProfitInsights from "@/components/analytics/ProfitInsights";
import ExpenseInsights from "@/components/analytics/ExpenseInsights";

const AIInsights = () => {
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>("month");
  const [activeTab, setActiveTab] = useState("products");

  return (
    <MainLayout>
      <div className="container mx-auto p-6 space-y-6 dir-rtl">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Sparkles className="h-8 w-8 text-primary" />
              تحليلات الذكاء الاصطناعي
            </h1>
            <p className="text-muted-foreground mt-2">
              احصل على رؤى وتوصيات مدعومة بالذكاء الاصطناعي لتحسين أداء عملك
            </p>
          </div>
        </div>

        <PeriodFilter selectedPeriod={selectedPeriod} onPeriodChange={setSelectedPeriod} />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="products" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              مقترحات المنتجات
            </TabsTrigger>
            <TabsTrigger value="sales" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              المبيعات والعروض
            </TabsTrigger>
            <TabsTrigger value="profit" className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              الأرباح
            </TabsTrigger>
            <TabsTrigger value="expenses" className="flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              المصروفات
            </TabsTrigger>
          </TabsList>

          <TabsContent value="products" className="mt-6">
            <ProductInsights selectedPeriod={selectedPeriod} />
          </TabsContent>

          <TabsContent value="sales" className="mt-6">
            <SalesInsights selectedPeriod={selectedPeriod} />
          </TabsContent>

          <TabsContent value="profit" className="mt-6">
            <ProfitInsights selectedPeriod={selectedPeriod} />
          </TabsContent>

          <TabsContent value="expenses" className="mt-6">
            <ExpenseInsights selectedPeriod={selectedPeriod} />
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
};

export default AIInsights;
