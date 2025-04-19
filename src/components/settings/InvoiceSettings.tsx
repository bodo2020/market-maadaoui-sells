import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { FilePenLine, Printer, Settings } from "lucide-react";

const invoiceSettingsSchema = z.object({
  invoicePrefix: z.string().min(1, { message: "الرجاء إدخال بادئة الفاتورة" }),
  nextInvoiceNumber: z.coerce.number().min(1, { message: "الرجاء إدخال رقم الفاتورة التالي" }),
  showLogo: z.boolean().default(true),
  showContact: z.boolean().default(true),
  showTaxId: z.boolean().default(false),
  taxId: z.string().optional(),
  footerText: z.string().optional(),
  termsAndConditions: z.string().optional(),
  autoSendEmail: z.boolean().default(false),
  autoPrint: z.boolean().default(false),
});

type InvoiceSettingsValues = z.infer<typeof invoiceSettingsSchema>;

interface InvoiceSettings {
  id: string;
  invoice_prefix: string;
  next_invoice_number: number;
  show_logo: boolean;
  show_contact: boolean;
  show_tax_id: boolean;
  tax_id: string | null;
  footer_text: string | null;
  terms_and_conditions: string | null;
  auto_send_email: boolean;
  auto_print: boolean;
  created_at: string;
  updated_at: string;
}

export default function InvoiceSettings() {
  const [isLoading, setIsLoading] = useState(false);
  
  const form = useForm<InvoiceSettingsValues>({
    resolver: zodResolver(invoiceSettingsSchema),
    defaultValues: {
      invoicePrefix: "",
      nextInvoiceNumber: 1,
      showLogo: true,
      showContact: true,
      showTaxId: false,
      taxId: "",
      footerText: "",
      termsAndConditions: "",
      autoSendEmail: false,
      autoPrint: false,
    },
  });

  const onSubmit = async (data: InvoiceSettingsValues) => {
    try {
      setIsLoading(true);
      
      const { error } = await supabase
        .from('invoice_settings')
        .upsert({
          invoice_prefix: data.invoicePrefix,
          next_invoice_number: data.nextInvoiceNumber,
          show_logo: data.showLogo,
          show_contact: data.showContact,
          show_tax_id: data.showTaxId,
          tax_id: data.taxId,
          footer_text: data.footerText,
          terms_and_conditions: data.termsAndConditions,
          auto_send_email: data.autoSendEmail,
          auto_print: data.autoPrint,
          updated_at: new Date().toISOString(),
        } as InvoiceSettings, {
          onConflict: 'id'
        });
        
      if (error) throw error;
      
      toast.success("تم حفظ إعدادات الفاتورة بنجاح");
    } catch (error) {
      console.error("Error saving invoice settings:", error);
      toast.error("حدث خطأ أثناء حفظ إعدادات الفاتورة");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const { data, error } = await supabase
          .from('invoice_settings')
          .select('*')
          .single();
          
        if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows returned
        
        if (data) {
          form.reset({
            invoicePrefix: data.invoice_prefix || "",
            nextInvoiceNumber: data.next_invoice_number || 1,
            showLogo: data.show_logo,
            showContact: data.show_contact,
            showTaxId: data.show_tax_id,
            taxId: data.tax_id || "",
            footerText: data.footer_text || "",
            termsAndConditions: data.terms_and_conditions || "",
            autoSendEmail: data.auto_send_email,
            autoPrint: data.auto_print,
          });
        }
      } catch (error) {
        console.error("Error fetching invoice settings:", error);
      }
    };
    
    fetchSettings();
  }, [form]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>إعدادات الفاتورة</CardTitle>
        <CardDescription>تكوين إعدادات الفواتير مثل البادئة والرقم التسلسلي والشعار</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="invoicePrefix"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>بادئة الفاتورة</FormLabel>
                    <FormControl>
                      <Input placeholder="INV" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="nextInvoiceNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>رقم الفاتورة التالي</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <div className="flex items-center space-x-2 rtl:space-x-reverse">
              <FormField
                control={form.control}
                name="showLogo"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-y-0 rounded-md border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">إظهار الشعار</FormLabel>
                      <FormDescription>
                        عرض شعار الشركة في الفاتورة
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
            </div>
            
            <div className="flex items-center space-x-2 rtl:space-x-reverse">
              <FormField
                control={form.control}
                name="showContact"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-y-0 rounded-md border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">إظهار معلومات الاتصال</FormLabel>
                      <FormDescription>
                        عرض معلومات الاتصال الخاصة بالشركة في الفاتورة
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
            </div>
            
            <div className="flex items-center space-x-2 rtl:space-x-reverse">
              <FormField
                control={form.control}
                name="showTaxId"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-y-0 rounded-md border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">إظهار الرقم الضريبي</FormLabel>
                      <FormDescription>
                        عرض الرقم الضريبي للشركة في الفاتورة
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
            </div>
            
            {form.watch("showTaxId") && (
              <FormField
                control={form.control}
                name="taxId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>الرقم الضريبي</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            
            <FormField
              control={form.control}
              name="footerText"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>نص التذييل</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="شكراً لتعاملكم"
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    نص يظهر في أسفل الفاتورة
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="termsAndConditions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>الشروط والأحكام</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="الشروط والأحكام الخاصة بالشركة"
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    الشروط والأحكام التي تظهر في الفاتورة
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="flex items-center space-x-2 rtl:space-x-reverse">
              <FormField
                control={form.control}
                name="autoSendEmail"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-y-0 rounded-md border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">إرسال الفاتورة تلقائياً عبر البريد الإلكتروني</FormLabel>
                      <FormDescription>
                        إرسال نسخة من الفاتورة تلقائياً إلى العميل عبر البريد الإلكتروني
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
            </div>
            
            <div className="flex items-center space-x-2 rtl:space-x-reverse">
              <FormField
                control={form.control}
                name="autoPrint"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-y-0 rounded-md border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">طباعة الفاتورة تلقائياً</FormLabel>
                      <FormDescription>
                        طباعة الفاتورة تلقائياً بعد إتمام عملية البيع
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
            </div>
            
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "جاري الحفظ..." : "حفظ إعدادات الفاتورة"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
