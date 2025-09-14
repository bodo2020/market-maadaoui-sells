import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  FileDown, 
  ArrowLeft, 
  Calendar,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Eye,
  CheckSquare
} from "lucide-react";
import { 
  fetchInventorySessions,
  fetchInventoryRecordsByDate,
  approveInventorySession,
  InventorySession,
  InventoryRecord
} from "@/services/supabase/inventoryService";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import * as XLSX from 'exceljs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";

export default function InventoryHistoryPage() {
  const [sessions, setSessions] = useState<InventorySession[]>([]);
  const [selectedSession, setSelectedSession] = useState<InventorySession | null>(null);
  const [sessionRecords, setSessionRecords] = useState<InventoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [approving, setApproving] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    setLoading(true);
    try {
      const data = await fetchInventorySessions();
      setSessions(data);
    } catch (error) {
      console.error("Error loading sessions:", error);
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء تحميل سجل الجرد",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const loadSessionRecords = async (session: InventorySession) => {
    setLoadingRecords(true);
    try {
      const records = await fetchInventoryRecordsByDate(session.session_date);
      setSessionRecords(records);
      setSelectedSession(session);
      setDetailsOpen(true);
    } catch (error) {
      console.error("Error loading session records:", error);
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء تحميل تفاصيل الجرد",
        variant: "destructive"
      });
    } finally {
      setLoadingRecords(false);
    }
  };

  const exportSessionToExcel = async (session: InventorySession) => {
    setExporting(true);
    try {
      const records = await fetchInventoryRecordsByDate(session.session_date);
      
      const workbook = new XLSX.Workbook();
      const worksheet = workbook.addWorksheet('تقرير الجرد');

      worksheet.properties.defaultRowHeight = 25;

      // العنوان الرئيسي
      const sessionDate = format(new Date(session.session_date), 'yyyy-MM-dd', { locale: ar });
      worksheet.mergeCells('A1:G3');
      const titleCell = worksheet.getCell('A1');
      titleCell.value = `تقرير الجرد\nتاريخ: ${sessionDate}`;
      titleCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      titleCell.font = { size: 16, bold: true };
      titleCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };

      // رؤوس الأعمدة
      const headers = ['اسم المنتج', 'الباركود', 'الكمية المتوقعة', 'الكمية الفعلية', 'الفرق', 'القيمة', 'الحالة'];
      const headerRow = worksheet.getRow(5);
      headers.forEach((header, index) => {
        const cell = headerRow.getCell(index + 1);
        cell.value = header;
        cell.font = { bold: true };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFD0D0D0' }
        };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });

      // البيانات
      records.forEach((record, index) => {
        const row = worksheet.getRow(6 + index);
        const statusText = record.status === 'checked' ? 'مطابق' : 
                          record.status === 'discrepancy' ? 'يوجد اختلاف' : 'معلق';
        
        row.getCell(1).value = record.products?.name || '';
        row.getCell(2).value = record.products?.barcode || '-';
        row.getCell(3).value = record.expected_quantity;
        row.getCell(4).value = record.actual_quantity;
        row.getCell(5).value = record.difference;
        row.getCell(6).value = `${Math.abs(record.difference_value).toFixed(2)} ج.م`;
        row.getCell(7).value = statusText;

        // تنسيق الصفوف
        for (let i = 1; i <= 7; i++) {
          const cell = row.getCell(i);
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };

          if (i === 7) {
            if (record.status === 'checked') {
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE0FFE0' }
              };
            } else if (record.status === 'discrepancy') {
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFFFE0E0' }
              };
            }
          }
        }
      });

      // ملخص الجرد
      const summaryStartRow = 8 + records.length;
      worksheet.mergeCells(`A${summaryStartRow}:G${summaryStartRow}`);
      const summaryTitleCell = worksheet.getCell(`A${summaryStartRow}`);
      summaryTitleCell.value = 'ملخص الجرد';
      summaryTitleCell.font = { size: 14, bold: true };
      summaryTitleCell.alignment = { horizontal: 'center' };

      const summaryData = [
        [`إجمالي المنتجات: ${session.total_products}`],
        [`المنتجات المجردة: ${session.completed_products}`],
        [`المنتجات المطابقة: ${session.matched_products}`],
        [`المنتجات بها اختلاف: ${session.discrepancy_products}`],
        [`قيمة الفروقات: ${session.total_difference_value.toFixed(2)} ج.م`]
      ];

      summaryData.forEach((data, index) => {
        const row = worksheet.getRow(summaryStartRow + 1 + index);
        worksheet.mergeCells(`A${summaryStartRow + 1 + index}:G${summaryStartRow + 1 + index}`);
        const cell = row.getCell(1);
        cell.value = data[0];
        cell.alignment = { horizontal: 'right' };
        cell.font = { size: 11 };
      });

      // تعيين عرض الأعمدة
      worksheet.getColumn(1).width = 25;
      worksheet.getColumn(2).width = 15;
      worksheet.getColumn(3).width = 15;
      worksheet.getColumn(4).width = 15;
      worksheet.getColumn(5).width = 10;
      worksheet.getColumn(6).width = 15;
      worksheet.getColumn(7).width = 15;

      // تصدير الملف
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `جرد_${sessionDate}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "تم التصدير بنجاح",
        description: "تم تصدير تقرير الجرد إلى ملف Excel",
      });
    } catch (error) {
      console.error("Error exporting to Excel:", error);
      toast({
        title: "خطأ في التصدير",
        description: "حدث خطأ أثناء تصدير التقرير",
        variant: "destructive"
      });
    } finally {
      setExporting(false);
    }
  };

  const handleApproveSession = async (session: InventorySession) => {
    if (session.status !== 'completed') {
      toast({
        title: "خطأ",
        description: "لا يمكن الموافقة على جرد غير مكتمل",
        variant: "destructive"
      });
      return;
    }

    setApproving(session.id);
    try {
      await approveInventorySession(session.id);
      
      // تحديث قائمة الجلسات
      await loadSessions();
      
      toast({
        title: "تمت الموافقة",
        description: "تم الموافقة على الجرد وتحديث الكميات في النظام",
      });
    } catch (error) {
      console.error("Error approving session:", error);
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء الموافقة على الجرد",
        variant: "destructive"
      });
    } finally {
      setApproving(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'text-purple-600';
      case 'completed': return 'text-green-600';
      case 'active': return 'text-blue-600';
      default: return 'text-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': return <CheckSquare className="h-4 w-4 text-purple-600" />;
      case 'completed': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'active': return <AlertCircle className="h-4 w-4 text-blue-600" />;
      default: return null;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'approved': return 'معتمد';
      case 'completed': return 'مكتمل';
      case 'active': return 'نشط';
      default: return status;
    }
  };

  const totalSessions = sessions.length;
  const completedSessions = sessions.filter(s => s.status === 'completed').length;
  const approvedSessions = sessions.filter(s => s.status === 'approved').length;
  const totalDiscrepancyValue = sessions.reduce((sum, s) => sum + s.total_difference_value, 0);

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-4 space-x-reverse">
            <Button 
              variant="outline" 
              onClick={() => navigate('/inventory')}
            >
              <ArrowLeft className="ml-2 h-4 w-4" />
              العودة للجرد
            </Button>
            <div>
              <h1 className="text-2xl font-bold">سجل الجرد</h1>
              <p className="text-muted-foreground">
                جميع عمليات الجرد المسجلة
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">إجمالي الجرد</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalSessions}</div>
              <p className="text-xs text-muted-foreground">عملية جرد مسجلة</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">الجرد المكتمل</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{completedSessions}</div>
              <p className="text-xs text-muted-foreground">في انتظار الموافقة</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">الجرد المعتمد</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">{approvedSessions}</div>
              <p className="text-xs text-muted-foreground">تم اعتماده وتحديث الكميات</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">قيمة الفروقات</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {totalDiscrepancyValue.toFixed(2)} ج.م
              </div>
              <p className="text-xs text-muted-foreground">إجمالي قيمة الفروقات</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Calendar className="ml-2 h-5 w-5" />
              سجل عمليات الجرد
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center items-center p-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>التاريخ</TableHead>
                      <TableHead>إجمالي المنتجات</TableHead>
                      <TableHead>تم الجرد</TableHead>
                      <TableHead>مطابق</TableHead>
                      <TableHead>اختلاف</TableHead>
                      <TableHead>قيمة الفروقات</TableHead>
                      <TableHead>الحالة</TableHead>
                      <TableHead>الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          لا توجد عمليات جرد مسجلة
                        </TableCell>
                      </TableRow>
                    ) : (
                      sessions.map((session) => (
                        <TableRow key={session.id}>
                          <TableCell>
                            {format(new Date(session.session_date), 'dd/MM/yyyy', { locale: ar })}
                          </TableCell>
                          <TableCell>{session.total_products}</TableCell>
                          <TableCell>
                            <span className="text-blue-600 font-medium">
                              {session.completed_products}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center space-x-2 space-x-reverse">
                              <CheckCircle className="h-4 w-4 text-green-600" />
                              <span className="text-green-600 font-medium">
                                {session.matched_products}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center space-x-2 space-x-reverse">
                              <AlertCircle className="h-4 w-4 text-red-600" />
                              <span className="text-red-600 font-medium">
                                {session.discrepancy_products}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center space-x-2 space-x-reverse">
                              {session.total_difference_value > 0 ? (
                                <TrendingUp className="h-4 w-4 text-red-600" />
                              ) : session.total_difference_value < 0 ? (
                                <TrendingDown className="h-4 w-4 text-green-600" />
                              ) : null}
                              <span className={`font-medium ${
                                session.total_difference_value > 0 ? 'text-red-600' :
                                session.total_difference_value < 0 ? 'text-green-600' :
                                'text-gray-600'
                              }`}>
                                {Math.abs(session.total_difference_value).toFixed(2)} ج.م
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center space-x-2 space-x-reverse">
                              {getStatusIcon(session.status)}
                              <span className={`text-sm ${getStatusColor(session.status)}`}>
                                {getStatusText(session.status)}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => loadSessionRecords(session)}
                                disabled={loadingRecords}
                              >
                                <Eye className="ml-2 h-4 w-4" />
                                عرض
                              </Button>
                              
                              {/* زر الموافقة للأدمن فقط */}
                              {isAdmin && session.status === 'completed' && (
                                <Button
                                  size="sm"
                                  variant="default"
                                  onClick={() => handleApproveSession(session)}
                                  disabled={approving === session.id}
                                  className="bg-purple-600 hover:bg-purple-700"
                                >
                                  <CheckSquare className={`ml-2 h-4 w-4 ${approving === session.id ? 'animate-spin' : ''}`} />
                                  {approving === session.id ? 'جاري الموافقة...' : 'موافقة'}
                                </Button>
                              )}
                              
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => exportSessionToExcel(session)}
                                disabled={exporting}
                              >
                                <FileDown className="ml-2 h-4 w-4" />
                                تصدير
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* تفاصيل الجرد */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              تفاصيل الجرد - {selectedSession && format(new Date(selectedSession.session_date), 'dd/MM/yyyy', { locale: ar })}
            </DialogTitle>
          </DialogHeader>
          
          {loadingRecords ? (
            <div className="flex justify-center items-center p-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="text-2xl font-bold">{selectedSession?.total_products}</div>
                    <p className="text-sm text-muted-foreground">إجمالي المنتجات</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-2xl font-bold text-blue-600">{selectedSession?.completed_products}</div>
                    <p className="text-sm text-muted-foreground">تم الجرد</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-2xl font-bold text-green-600">{selectedSession?.matched_products}</div>
                    <p className="text-sm text-muted-foreground">مطابق</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-2xl font-bold text-red-600">{selectedSession?.discrepancy_products}</div>
                    <p className="text-sm text-muted-foreground">اختلاف</p>
                  </CardContent>
                </Card>
              </div>

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>المنتج</TableHead>
                      <TableHead>الباركود</TableHead>
                      <TableHead>الكمية المتوقعة</TableHead>
                      <TableHead>الكمية الفعلية</TableHead>
                      <TableHead>الفرق</TableHead>
                      <TableHead>القيمة</TableHead>
                      <TableHead>الحالة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessionRecords.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell>
                          <div className="flex items-center space-x-3 space-x-reverse">
                            <div className="h-8 w-8 rounded bg-gray-100 flex items-center justify-center">
                              <img 
                                src={record.products?.image_urls?.[0] || "/placeholder.svg"} 
                                alt={record.products?.name}
                                className="h-4 w-4 object-contain"
                              />
                            </div>
                            <div>
                              <div className="font-medium">{record.products?.name}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{record.products?.barcode || '-'}</TableCell>
                        <TableCell>{record.expected_quantity}</TableCell>
                        <TableCell>{record.actual_quantity}</TableCell>
                        <TableCell>
                          <span className={`font-medium ${
                            record.difference === 0 
                              ? 'text-green-600' 
                              : record.difference > 0 
                                ? 'text-blue-600' 
                                : 'text-red-600'
                          }`}>
                            {record.difference > 0 ? '+' : ''}{record.difference}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className={`font-medium ${
                            record.difference_value === 0 
                              ? 'text-green-600' 
                              : record.difference_value > 0 
                                ? 'text-red-600' 
                                : 'text-blue-600'
                          }`}>
                            {Math.abs(record.difference_value).toFixed(2)} ج.م
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2 space-x-reverse">
                            {record.status === 'checked' && <CheckCircle className="h-4 w-4 text-green-600" />}
                            {record.status === 'discrepancy' && <AlertCircle className="h-4 w-4 text-red-600" />}
                            <span className={`text-sm ${
                              record.status === 'checked' ? 'text-green-600' :
                              record.status === 'discrepancy' ? 'text-red-600' :
                              'text-gray-500'
                            }`}>
                              {record.status === 'checked' ? 'مطابق' :
                               record.status === 'discrepancy' ? 'اختلاف' : 'معلق'}
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}