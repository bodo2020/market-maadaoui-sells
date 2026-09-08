import { FormEvent, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CreditCard,
  FilterX,
  Receipt,
  RotateCcw,
  Search,
  ShoppingBag,
  ShoppingCart,
  UserRound,
  WalletCards,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import BrandLoader from "@/components/ui/BrandLoader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { siteConfig } from "@/config/site";
import {
  fetchSalesReportV2,
  SalesReportChannel,
  SalesReportRowV2,
} from "@/services/supabase/salesReportV2Service";

const money = (value: number | null | undefined) =>
  `${Number(value || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${siteConfig.currency}`;

const count = (value: number | null | undefined, digits = 0) =>
  Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: digits });

const formatDateTime = (value: string) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ar-EG", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

function Metric({
  title,
  value,
  note,
  icon,
  danger = false,
}: {
  title: string;
  value: string;
  note: string;
  icon: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <Card className="border-0 shadow-sm ring-1 ring-black/5">
      <CardContent className="p-4 md:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-muted-foreground md:text-sm">{title}</p>
            <p className={`mt-2 truncate text-xl font-black md:text-2xl ${danger ? "text-rose-700" : "text-foreground"}`}>{value}</p>
            <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{note}</p>
          </div>
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${danger ? "bg-rose-50 text-rose-700" : "bg-primary/10 text-primary"}`}>
            {icon}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SalesReportV2({
  branchId,
  from,
  to,
  periodLabel,
}: {
  branchId: string;
  from: Date;
  to: Date;
  periodLabel: string;
}) {
  const [channel, setChannel] = useState<SalesReportChannel>("all");
  const [cashierId, setCashierId] = useState("all");
  const [paymentCode, setPaymentCode] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selectedRow, setSelectedRow] = useState<SalesReportRowV2 | null>(null);
  const pageSize = 25;

  const query = useQuery({
    queryKey: [
      "reporting-v2-sales",
      branchId,
      from.toISOString(),
      to.toISOString(),
      channel,
      cashierId,
      paymentCode,
      search,
      page,
    ],
    queryFn: () => fetchSalesReportV2(branchId, from, to, {
      channel,
      cashierId: cashierId === "all" ? null : cashierId,
      paymentCode: paymentCode === "all" ? null : paymentCode,
      search: search || null,
      limit: pageSize,
      offset: page * pageSize,
    }),
    staleTime: 20_000,
  });

  const report = query.data;
  const summary = report?.summary;
  const hourly = useMemo(
    () => (report?.hourly || []).map((row) => ({ ...row, label: `${String(row.hour).padStart(2, "0")}:00` })),
    [report?.hourly],
  );
  const busiest = useMemo(
    () => [...(report?.hourly || [])].sort((a, b) => b.transactions - a.transactions || b.net_sales - a.net_sales)[0],
    [report?.hourly],
  );

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setPage(0);
    setSearch(searchInput.trim());
  };

  const resetFilters = () => {
    setChannel("all");
    setCashierId("all");
    setPaymentCode("all");
    setSearchInput("");
    setSearch("");
    setPage(0);
  };

  const activeFilters = channel !== "all" || cashierId !== "all" || paymentCode !== "all" || Boolean(search);

  return (
    <div className="space-y-5">
      <Card className="border-0 shadow-sm ring-1 ring-black/5">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="text-lg">تقرير المبيعات المتقدم</CardTitle>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {periodLabel} • فلترة وحسابات من السيرفر على Invoice V2، وليست تجميعًا من المتصفح.
              </p>
            </div>
            {activeFilters && (
              <Button variant="ghost" size="sm" className="self-start text-muted-foreground" onClick={resetFilters}>
                <FilterX className="ml-2 h-4 w-4" />
                مسح الفلاتر
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 lg:grid-cols-[160px_190px_190px_1fr]">
            <Select
              value={channel}
              onValueChange={(value) => {
                const next = value as SalesReportChannel;
                setChannel(next);
                if (next === "online") setCashierId("all");
                setPage(0);
              }}
            >
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل قنوات البيع</SelectItem>
                <SelectItem value="pos">نقطة البيع POS</SelectItem>
                <SelectItem value="online">الأونلاين</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={cashierId}
              disabled={channel === "online"}
              onValueChange={(value) => { setCashierId(value); setPage(0); }}
            >
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="كل الكاشير" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الكاشير</SelectItem>
                {(report?.cashiers || []).map((cashier) => cashier.cashier_id && (
                  <SelectItem key={cashier.cashier_id} value={cashier.cashier_id}>{cashier.cashier_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={paymentCode} onValueChange={(value) => { setPaymentCode(value); setPage(0); }}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="كل وسائل الدفع" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل وسائل الدفع</SelectItem>
                {(report?.payment_methods || []).map((payment) => (
                  <SelectItem key={payment.code} value={payment.code}>{payment.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <form onSubmit={submitSearch} className="flex min-w-0 gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="رقم فاتورة، عميل، هاتف أو كاشير..."
                  className="rounded-xl pr-9"
                />
              </div>
              <Button type="submit" className="rounded-xl">بحث</Button>
            </form>
          </div>
        </CardContent>
      </Card>

      {query.isLoading ? (
        <div className="flex min-h-[360px] items-center justify-center"><BrandLoader size="lg" /></div>
      ) : query.isError || !report || !summary ? (
        <Alert variant="destructive">
          <AlertDescription>تعذر تحميل تقرير المبيعات. أعد المحاولة أو راجع صلاحية عرض التقارير.</AlertDescription>
        </Alert>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Metric
              title="صافي المبيعات"
              value={money(summary.net_sales)}
              note={`${count(summary.transactions)} عملية بعد المرتجعات`}
              icon={<BarChart3 className="h-5 w-5" />}
            />
            <Metric
              title="عدد العمليات"
              value={count(summary.transactions)}
              note={`${count(summary.pos_transactions)} POS • ${count(summary.online_transactions)} أونلاين`}
              icon={<Receipt className="h-5 w-5" />}
            />
            <Metric
              title="متوسط الفاتورة"
              value={money(summary.average_ticket)}
              note={`${count(summary.pos_item_lines)} سطر أصناف POS`}
              icon={<ShoppingCart className="h-5 w-5" />}
            />
            <Metric
              title="المرتجعات"
              value={money(summary.refunds)}
              note={`${count(summary.return_count)} مرتجع معتمد في الفترة`}
              icon={<RotateCcw className="h-5 w-5" />}
              danger
            />
            <Metric
              title="أعلى ساعة نشاطًا"
              value={busiest && busiest.transactions > 0 ? `${String(busiest.hour).padStart(2, "0")}:00` : "—"}
              note={busiest && busiest.transactions > 0 ? `${count(busiest.transactions)} عملية • ${money(busiest.net_sales)}` : "لا توجد حركة كافية"}
              icon={<Clock3 className="h-5 w-5" />}
            />
          </section>

          <section className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
            <Card className="border-0 shadow-sm ring-1 ring-black/5">
              <CardHeader>
                <CardTitle className="text-lg">المبيعات حسب الساعة</CardTitle>
                <p className="text-xs text-muted-foreground">الصافي بعد المرتجعات، بالتوقيت المحلي للقاهرة.</p>
              </CardHeader>
              <CardContent className="h-[320px] px-2 md:px-5">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hourly} margin={{ top: 10, right: 6, left: 6, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.25} />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval={2} />
                    <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={55} />
                    <Tooltip formatter={(value: number) => money(value)} labelStyle={{ textAlign: "right" }} />
                    <Bar dataKey="net_sales" name="صافي المبيعات" fill="hsl(var(--primary))" radius={[7, 7, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm ring-1 ring-black/5">
              <CardHeader>
                <CardTitle className="text-lg">توزيع وسائل الدفع</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {report.payment_methods.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">لا توجد وسائل دفع ضمن الفلتر الحالي.</p>
                ) : report.payment_methods.map((payment) => (
                  <button
                    key={payment.code}
                    type="button"
                    onClick={() => { setPaymentCode(payment.code); setPage(0); }}
                    className="w-full rounded-2xl border p-3.5 text-right transition hover:bg-muted/40"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          {payment.method_type === "card" ? <CreditCard className="h-4 w-4" /> : <WalletCards className="h-4 w-4" />}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{payment.name}</p>
                          <p className="text-[11px] text-muted-foreground">{count(payment.transactions)} عملية</p>
                        </div>
                      </div>
                      <strong>{money(payment.sales)}</strong>
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>
          </section>

          {report.cashiers.length > 0 && channel !== "online" && (
            <Card className="border-0 shadow-sm ring-1 ring-black/5">
              <CardHeader>
                <CardTitle className="text-lg">أداء الكاشير</CardTitle>
                <p className="text-xs text-muted-foreground">صافي مبيعات كل كاشير بعد المرتجعات المسجلة على فواتيره.</p>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">الكاشير</TableHead>
                      <TableHead className="text-right">العمليات</TableHead>
                      <TableHead className="text-right">المبيعات</TableHead>
                      <TableHead className="text-right">المرتجعات</TableHead>
                      <TableHead className="text-right">الصافي</TableHead>
                      <TableHead className="text-right">متوسط الفاتورة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.cashiers.map((cashier) => (
                      <TableRow
                        key={cashier.cashier_id || cashier.cashier_name}
                        className="cursor-pointer"
                        onClick={() => cashier.cashier_id && setCashierId(cashier.cashier_id)}
                      >
                        <TableCell className="font-semibold"><span className="inline-flex items-center gap-2"><UserRound className="h-4 w-4 text-muted-foreground" />{cashier.cashier_name}</span></TableCell>
                        <TableCell>{count(cashier.transactions)}</TableCell>
                        <TableCell>{money(cashier.sales)}</TableCell>
                        <TableCell className={cashier.refunds > 0 ? "text-rose-700" : ""}>{money(cashier.refunds)}</TableCell>
                        <TableCell className="font-black">{money(cashier.net_sales)}</TableCell>
                        <TableCell>{money(cashier.average_ticket)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <Card className="border-0 shadow-sm ring-1 ring-black/5">
            <CardHeader>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-lg">المعاملات</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">{count(report.pagination.total)} نتيجة • اضغط على أي صف للتفاصيل.</p>
                </div>
                {query.isFetching && <Badge variant="secondary">جاري التحديث...</Badge>}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">المرجع</TableHead>
                      <TableHead className="text-right">القناة</TableHead>
                      <TableHead className="text-right">التاريخ</TableHead>
                      <TableHead className="text-right">الكاشير / العميل</TableHead>
                      <TableHead className="text-right">الدفع</TableHead>
                      <TableHead className="text-right">قبل المرتجع</TableHead>
                      <TableHead className="text-right">مرتجع</TableHead>
                      <TableHead className="text-right">الصافي</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.rows.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="h-28 text-center text-muted-foreground">لا توجد معاملات مطابقة للفلاتر.</TableCell></TableRow>
                    ) : report.rows.map((row) => (
                      <TableRow key={`${row.channel}:${row.id}`} className="cursor-pointer hover:bg-muted/40" onClick={() => setSelectedRow(row)}>
                        <TableCell className="font-semibold tabular-nums">{row.document_number}</TableCell>
                        <TableCell>
                          <Badge variant={row.channel === "pos" ? "secondary" : "outline"}>
                            {row.channel === "pos" ? <><ShoppingCart className="ml-1 h-3 w-3" />POS</> : <><ShoppingBag className="ml-1 h-3 w-3" />أونلاين</>}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{formatDateTime(row.occurred_at)}</TableCell>
                        <TableCell>
                          <p className="font-medium">{row.cashier_name || row.customer_name || "—"}</p>
                          {row.customer_name && row.cashier_name && <p className="text-[11px] text-muted-foreground">{row.customer_name}</p>}
                        </TableCell>
                        <TableCell>{row.payment_name}</TableCell>
                        <TableCell>{money(row.recognized_sale)}</TableCell>
                        <TableCell className={row.refunds > 0 ? "font-semibold text-rose-700" : "text-muted-foreground"}>{row.refunds > 0 ? `- ${money(row.refunds)}` : "—"}</TableCell>
                        <TableCell className="font-black">{money(row.net_sale)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-col gap-3 border-t p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  عرض {report.rows.length ? count(report.pagination.offset + 1) : "0"}–{count(report.pagination.offset + report.rows.length)} من {count(report.pagination.total)}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page === 0 || query.isFetching} onClick={() => setPage((value) => Math.max(value - 1, 0))}>
                    <ChevronRight className="ml-1 h-4 w-4" />السابق
                  </Button>
                  <Button variant="outline" size="sm" disabled={!report.pagination.has_more || query.isFetching} onClick={() => setPage((value) => value + 1)}>
                    التالي<ChevronLeft className="mr-1 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={Boolean(selectedRow)} onOpenChange={(open) => !open && setSelectedRow(null)}>
        <DialogContent className="max-w-xl" dir="rtl">
          {selectedRow && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Receipt className="h-5 w-5 text-primary" />
                  {selectedRow.channel === "pos" ? "تفاصيل فاتورة POS" : "تفاصيل طلب أونلاين"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="rounded-2xl bg-muted/40 p-4">
                  <p className="text-xs text-muted-foreground">المرجع</p>
                  <p className="mt-1 font-black tabular-nums">{selectedRow.document_number}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(selectedRow.occurred_at)}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">وسيلة الدفع</p><p className="mt-1 font-semibold">{selectedRow.payment_name}</p></div>
                  <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">عدد البنود</p><p className="mt-1 font-semibold">{count(selectedRow.item_count)}</p></div>
                  <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">الكاشير</p><p className="mt-1 font-semibold">{selectedRow.cashier_name || "—"}</p></div>
                  <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">العميل</p><p className="mt-1 font-semibold">{selectedRow.customer_name || selectedRow.customer_phone || "—"}</p></div>
                </div>
                <div className="space-y-2 rounded-2xl border p-4 text-sm">
                  <div className="flex justify-between gap-3"><span className="text-muted-foreground">إجمالي الفاتورة</span><strong>{money(selectedRow.gross_amount)}</strong></div>
                  <div className="flex justify-between gap-3"><span className="text-muted-foreground">خصم المنتجات</span><span>{money(selectedRow.product_discount)}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-muted-foreground">خصم الولاء</span><span>{money(selectedRow.loyalty_discount)}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-muted-foreground">المبلغ المعترف به للبيع</span><strong>{money(selectedRow.recognized_sale)}</strong></div>
                  <div className="flex justify-between gap-3 text-rose-700"><span>المرتجعات</span><strong>- {money(selectedRow.refunds)}</strong></div>
                  <div className="flex justify-between gap-3 border-t pt-3 text-base"><span className="font-semibold">صافي الأثر</span><strong>{money(selectedRow.net_sale)}</strong></div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
