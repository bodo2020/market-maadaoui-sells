
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Sale } from "@/types";
import { useForm } from "react-hook-form";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface InvoiceEditDialogProps {
  isOpen: boolean;
  onClose: () => void;
  sale: Sale;
}

type FormValues = {
  customer_name: string;
  customer_phone: string;
};

const InvoiceEditDialog: React.FC<InvoiceEditDialogProps> = ({ isOpen, onClose, sale }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FormValues>({
    defaultValues: {
      customer_name: sale.customer_name || '',
      customer_phone: sale.customer_phone || '',
    },
  });

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    try {
      // Update the sale in the database (only customer info now)
      const { error } = await supabase
        .from("sales")
        .update({
          customer_name: values.customer_name,
          customer_phone: values.customer_phone,
        })
        .eq("id", sale.id);

      if (error) {
        throw error;
      }

      toast.success("تم تحديث الفاتورة بنجاح");
      onClose();
    } catch (error) {
      console.error("Error updating invoice:", error);
      toast.error("حدث خطأ أثناء تحديث الفاتورة");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>تعديل الفاتورة</DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="customer_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>اسم العميل</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="أدخل اسم العميل" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="customer_phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>رقم هاتف العميل</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="أدخل رقم هاتف العميل" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="pt-2 border-t mt-4">
              <div className="flex justify-between text-sm mb-1">
                <span>المجموع الفرعي:</span>
                <span>{sale.subtotal.toFixed(2)} ج.م</span>
              </div>
              <div className="flex justify-between text-sm mb-1">
                <span>الخصم:</span>
                <span>{sale.discount.toFixed(2)} ج.م</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>الإجمالي:</span>
                <span>{sale.total.toFixed(2)} ج.م</span>
              </div>
            </div>
            
            <DialogFooter className="flex gap-2 justify-end pt-4">
              <Button 
                type="submit" 
                disabled={isSubmitting}
              >
                {isSubmitting ? 'جاري الحفظ...' : 'حفظ التغييرات'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
              >
                إلغاء
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default InvoiceEditDialog;
