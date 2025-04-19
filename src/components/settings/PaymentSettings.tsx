
import { useState } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Banknote, CreditCard, Wallet } from "lucide-react";

const paymentSettingsSchema = z.object({
  enableCash: z.boolean().default(true),
  enableCard: z.boolean().default(true),
  enableEWallet: z.boolean().default(false),
  bankName: z.string().optional(),
  accountNumber: z.string().optional(),
  cardProcessingFee: z.coerce.number().min(0).max(10).optional(),
  eWalletName: z.string().optional(),
  eWalletProcessingFee: z.coerce.number().min(0).max(10).optional(),
  autoApplyFees: z.boolean().default(false),
});

type PaymentSettingsValues = z.infer<typeof paymentSettingsSchema>;

export default function PaymentSettings() {
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<PaymentSettingsValues>({
    resolver: zodResolver(paymentSettingsSchema),
    defaultValues: {
      enableCash: true,
      enableCard: true,
      enableEWallet: false,
      bankName: "",
      accountNumber: "",
      cardProcessingFee: 0,
      eWalletName: "",
      eWalletProcessingFee: 0,
      autoApplyFees: false,
    },
  });

  const onSubmit = async (data: PaymentSettingsValues) => {
    try {
      setIsLoading(true);
      
      const { error } = await supabase
        .from('payment_settings')
        .upsert({
          enable_cash: data.enableCash,
          enable_card: data.enableCard,
          enable_e_wallet: data.enableEWallet,
          bank_name: data.bankName,
          account_number: data.accountNumber,
          card_processing_fee: data.cardProcessingFee,
          e_wallet_name: data.eWalletName,
          e_wallet_processing_fee: data.eWalletProcessingFee,
          auto_apply_fees: data.autoApplyFees,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'id'
        });
        
      if (error) throw error;
      
      toast.success("تم حفظ إعدادات الدفع بنجاح");
    } catch (error) {
      console.error("Error saving payment settings:", error);
      toast.error("حدث خطأ أثناء حفظ إعدادات الدفع");
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch existing settings
  useState(() => {
    const fetchSettings = async () => {
      try {
        const { data, error } = await supabase
          .from('payment_settings')
          .select('*')
          .single();
          
        if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows returned
        
        if (data) {
          form.reset({
            enableCash: data.enable_cash,
            enableCard: data.enable_card,
            enableEWallet: data.enable_e_wallet,
            bankName: data.bank_name || "",
            accountNumber: data.account_number || "",
            cardProcessingFee: data.card_processing_fee || 0,
            eWalletName: data.e_wallet_name || "",
            eWalletProcessingFee: data.e_wallet_processing_fee || 0,
            autoApplyFees: data.auto_apply_fees,
          });
        }
      } catch (error) {
        console.error("Error fetching payment settings:", error);
      }
    };
    
    fetchSettings();
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>إعدادات الدفع</CardTitle>
        <CardDescription>تكوين طرق الدفع والرسوم المرتبطة بها</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between border p-4 rounded-md">
                <div className="flex items-center gap-3">
                  <Banknote className="h-5 w-5 text-green-600" />
                  <div>
                    <h3 className="font-medium">دفع نقدي</h3>
                    <p className="text-sm text-muted-foreground">قبول المدفوعات النقدية</p>
                  </div>
                </div>
                <FormField
                  control={form.control}
                  name="enableCash"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2 space-y-0">
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="border rounded-md">
                <div className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <CreditCard className="h-5 w-5 text-blue-600" />
                    <div>
                      <h3 className="font-medium">دفع بالبطاقة</h3>
                      <p className="text-sm text-muted-foreground">قبول المدفوعات بالبطاقة الائتمانية/البنكية</p>
                    </div>
                  </div>
                  <FormField
                    control={form.control}
                    name="enableCard"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
                
                {form.watch("enableCard") && (
                  <div className="border-t p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="bankName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>اسم البنك</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="accountNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>رقم الحساب</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name="cardProcessingFee"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>رسوم استخدام البطاقة (%)</FormLabel>
                          <FormControl>
                            <Input type="number" min="0" max="10" step="0.1" {...field} />
                          </FormControl>
                          <FormDescription>
                            رسوم إضافية تطبق على المشتريات بالبطاقة
                          </FormDescription>
                        </FormItem>
                      )}
                    />
                  </div>
                )}
              </div>
              
              <div className="border rounded-md">
                <div className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <Wallet className="h-5 w-5 text-purple-600" />
                    <div>
                      <h3 className="font-medium">محفظة إلكترونية</h3>
                      <p className="text-sm text-muted-foreground">قبول المدفوعات بالمحفظة الإلكترونية</p>
                    </div>
                  </div>
                  <FormField
                    control={form.control}
                    name="enableEWallet"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
                
                {form.watch("enableEWallet") && (
                  <div className="border-t p-4 space-y-3">
                    <FormField
                      control={form.control}
                      name="eWalletName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>اسم المحفظة الإلكترونية</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="مثال: فودافون كاش" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="eWalletProcessingFee"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>رسوم استخدام المحفظة (%)</FormLabel>
                          <FormControl>
                            <Input type="number" min="0" max="10" step="0.1" {...field} />
                          </FormControl>
                          <FormDescription>
                            رسوم إضافية تطبق على المشتريات بالمحفظة الإلكترونية
                          </FormDescription>
                        </FormItem>
                      )}
                    />
                  </div>
                )}
              </div>
              
              <div className="pt-4">
                <FormField
                  control={form.control}
                  name="autoApplyFees"
                  render={({ field }) => (
                    <FormItem className="flex items-start space-x-3 space-y-0 rtl:space-x-reverse">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>تطبيق الرسوم تلقائياً</FormLabel>
                        <FormDescription>
                          إضافة رسوم المعاملات تلقائياً إلى إجمالي الطلب
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />
              </div>
            </div>
            
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "جاري الحفظ..." : "حفظ إعدادات الدفع"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
