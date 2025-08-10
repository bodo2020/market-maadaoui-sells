
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useBranchStore } from "@/stores/branchStore";
import { fetchSalesSummaryByBranch, fetchTopProductsByBranch, BranchSalesSummary, TopProductRow } from "@/services/supabase/adminAnalyticsService";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const COLORS = ["#0ea5e9", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6", "#e11d48", "#a3e635", "#6366f1", "#06b6d4"];

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export default function SuperAdminDashboardDialog({ open, onOpenChange }: Props) {
  const { branches } = useBranchStore();
  const [range, setRange] = useState<{ from: Date; to: Date }>(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 6);
    return { from: startOfDay(start), to: endOfDay(end) };
  });
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<BranchSalesSummary[]>([]);
  const [topBranchId, setTopBranchId] = useState<string | "ALL">("ALL");
  const [topProducts, setTopProducts] = useState<TopProductRow[]>([]);

  const summaryTotals = useMemo(() => {
    return summary.reduce(
      (acc, r) => {
        acc.sales += r.total_sales || 0;
        acc.profit += r.total_profit || 0;
        acc.count += Number(r.sales_count || 0);
        return acc;
      },
      { sales: 0, profit: 0, count: 0 }
    );
  }, [summary]);

  const loadSummary = async () => {
    setLoading(true);
    const data = await fetchSalesSummaryByBranch({
      startDate: range?.from,
      endDate: range?.to,
    });
    setSummary(data);
    setLoading(false);
  };

  const loadTopProducts = async () => {
    const data = await fetchTopProductsByBranch({
      branchId: topBranchId === "ALL" ? null : topBranchId,
      startDate: range?.from,
      endDate: range?.to,
      limit: 10,
    });
    setTopProducts(data);
  };

  useEffect(() => {
    if (!open) return;
    loadSummary();
  }, [open, range]);

  useEffect(() => {
    if (!open) return;
    loadTopProducts();
  }, [open, range, topBranchId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>لوحة السوبر أدمن - إحصائيات الفروع</DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-6">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            <DateRangePicker
              numberOfMonths={2}
              initialDateFrom={range.from}
              initialDateTo={range.to}
              onUpdate={(r) => {
                const from = r.range.from ? startOfDay(r.range.from) : range.from;
                const to = r.range.to ? endOfDay(r.range.to) : range.to;
                setRange({ from, to });
              }}
            />
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={loadSummary} disabled={loading}>
                تحديث البيانات
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">إجمالي المبيعات</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">{summaryTotals.sales.toFixed(2)}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">إجمالي الأرباح</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">{summaryTotals.profit.toFixed(2)}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">عدد الفواتير</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">{summaryTotals.count}</CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            <Card className="h-[360px]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">مبيعات حسب الفرع</CardTitle>
              </CardHeader>
              <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summary}>
                    <XAxis dataKey="branch_name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="total_sales" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="h-[360px]">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm">أكثر المنتجات مبيعًا</CardTitle>
                <div className="min-w-[220px]">
                  <Select value={topBranchId} onValueChange={(v) => setTopBranchId(v as any)}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="اختر الفرع" />
                    </SelectTrigger>
                    <SelectContent className="max-h-64">
                      <SelectItem value="ALL">كل الفروع</SelectItem>
                      {branches.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={topProducts}
                      dataKey="total_sales"
                      nameKey="product_name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={(d: any) => `${d.product_name?.slice(0, 12) || ""}`}
                    >
                      {topProducts.map((_, idx) => (
                        <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card className="mt-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">تفاصيل الفروع</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[260px]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-right">
                      <th className="py-2 font-medium">الفرع</th>
                      <th className="py-2 font-medium">عدد الفواتير</th>
                      <th className="py-2 font-medium">إجمالي المبيعات</th>
                      <th className="py-2 font-medium">إجمالي الأرباح</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.map((row) => (
                      <tr key={row.branch_id || Math.random()} className="border-t">
                        <td className="py-2">{row.branch_name || "-"}</td>
                        <td className="py-2">{row.sales_count}</td>
                        <td className="py-2">{row.total_sales.toFixed(2)}</td>
                        <td className="py-2">{row.total_profit.toFixed(2)}</td>
                      </tr>
                    ))}
                    {summary.length === 0 && (
                      <tr>
                        <td className="py-4 text-center text-muted-foreground" colSpan={4}>
                          لا توجد بيانات للفترة المحددة
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
