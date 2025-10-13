import { useState } from "react";
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import MainLayout from "@/components/layout/MainLayout";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import * as ExcelJS from "exceljs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";

interface ProductData {
  barcode: string;
  quantity: number;
}

export default function InventoryImport() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<{
    total: number;
    success: number;
    failed: number;
  } | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      if (
        selectedFile.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        selectedFile.type === "application/vnd.ms-excel"
      ) {
        setFile(selectedFile);
        setResults(null);
      } else {
        toast.error("يرجى اختيار ملف Excel صالح");
      }
    }
  };

  const processExcelFile = async () => {
    if (!file) {
      toast.error("يرجى اختيار ملف أولاً");
      return;
    }

    setIsProcessing(true);
    setProgress(0);

    try {
      // قراءة الملف
      const data = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(data);
      
      const worksheet = workbook.worksheets[0];
      
      // استخراج بيانات المنتجات
      const products: ProductData[] = [];
      
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // تخطي الصف الأول (العناوين)
        
        const barcode = row.getCell(2).value; // العمود الثاني = الباركود
        const quantity = row.getCell(5).value; // العمود الخامس = الكمية

        if (barcode && quantity !== null && quantity !== undefined) {
          products.push({
            barcode: String(barcode).trim(),
            quantity: Number(quantity),
          });
        }
      });

      if (products.length === 0) {
        toast.error("لم يتم العثور على بيانات صالحة في الملف");
        setIsProcessing(false);
        return;
      }

      // تحديث الكميات بشكل متتالي مع تحديث التقدم
      let successCount = 0;
      let failedCount = 0;

      for (let i = 0; i < products.length; i++) {
        const product = products[i];
        
        try {
          // البحث عن المنتج بالباركود
          const { data: productData, error: productError } = await supabase
            .from("products")
            .select("id")
            .eq("barcode", product.barcode)
            .single();

          if (productError || !productData) {
            console.error(`Product not found: ${product.barcode}`);
            failedCount++;
            continue;
          }

          // تحديث الكمية في جميع الفروع
          const { error: updateError } = await supabase
            .from("inventory")
            .update({ 
              quantity: product.quantity,
              updated_at: new Date().toISOString()
            })
            .eq("product_id", productData.id);

          if (updateError) {
            console.error(`Update error for ${product.barcode}:`, updateError);
            failedCount++;
          } else {
            successCount++;
          }
        } catch (error) {
          console.error(`Error processing ${product.barcode}:`, error);
          failedCount++;
        }

        // تحديث التقدم
        setProgress(Math.round(((i + 1) / products.length) * 100));
      }

      setResults({
        total: products.length,
        success: successCount,
        failed: failedCount,
      });

      if (successCount > 0) {
        toast.success(`تم تحديث ${successCount} منتج بنجاح`);
      }
      if (failedCount > 0) {
        toast.error(`فشل تحديث ${failedCount} منتج`);
      }
    } catch (error) {
      console.error("Error processing file:", error);
      toast.error("حدث خطأ أثناء معالجة الملف");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <MainLayout>
      <div className="container mx-auto p-6 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-6 w-6" />
              استيراد كميات المخزون من Excel
            </CardTitle>
            <CardDescription>
              قم برفع ملف Excel يحتوي على أعمدة "الباركود" و "الكمية" لتحديث المخزون
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* منطقة رفع الملف */}
            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <div className="space-y-2">
                <label htmlFor="file-upload" className="cursor-pointer">
                  <Button variant="outline" asChild>
                    <span>
                      {file ? file.name : "اختر ملف Excel"}
                    </span>
                  </Button>
                </label>
                <input
                  id="file-upload"
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <p className="text-sm text-muted-foreground">
                  الملف يجب أن يحتوي على عمود "الباركود" وعمود "الكمية"
                </p>
              </div>
            </div>

            {/* شريط التقدم */}
            {isProcessing && (
              <div className="space-y-2">
                <Progress value={progress} />
                <p className="text-sm text-center text-muted-foreground">
                  جاري المعالجة... {progress}%
                </p>
              </div>
            )}

            {/* النتائج */}
            {results && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-1">
                    <p>إجمالي المنتجات: {results.total}</p>
                    <p className="text-green-600">نجح: {results.success}</p>
                    {results.failed > 0 && (
                      <p className="text-red-600">فشل: {results.failed}</p>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* زر المعالجة */}
            <Button
              onClick={processExcelFile}
              disabled={!file || isProcessing}
              className="w-full"
              size="lg"
            >
              {isProcessing ? "جاري المعالجة..." : "تحديث المخزون"}
            </Button>

            {/* تعليمات */}
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2 text-sm">
                  <p className="font-semibold">تعليمات:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>يجب أن يحتوي الملف على عمود باسم "الباركود" أو "barcode"</li>
                    <li>يجب أن يحتوي الملف على عمود باسم "الكمية" أو "quantity"</li>
                    <li>سيتم تحديث الكميات في جميع الفروع</li>
                    <li>المنتجات التي لا يوجد لها باركود مطابق سيتم تجاهلها</li>
                  </ul>
                </div>
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
