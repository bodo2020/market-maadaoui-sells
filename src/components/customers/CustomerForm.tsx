
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Customer } from "@/types";
import { addCustomer, updateCustomer } from "@/services/supabase/customerService";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Building, User, Phone, Mail, FileText } from "lucide-react";

interface CustomerFormProps {
  customer: Customer | null;
  onClose: () => void;
}

export default function CustomerForm({ customer, onClose }: CustomerFormProps) {
  const queryClient = useQueryClient();
  
  const form = useForm({
    defaultValues: {
      name: customer?.name || "",
      phone: customer?.phone || "",
      email: customer?.email || "",
      address: customer?.address || "",
      notes: customer?.notes || ""
    }
  });
  
  const addMutation = useMutation({
    mutationFn: addCustomer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      onClose();
    }
  });
  
  const updateMutation = useMutation({
    mutationFn: (data: Partial<Customer>) => 
      updateCustomer(customer!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      onClose();
    }
  });
  
  const onSubmit = async (data: any) => {
    if (customer) {
      await updateMutation.mutateAsync(data);
    } else {
      await addMutation.mutateAsync(data);
    }
  };
  
  const isLoading = addMutation.isLoading || updateMutation.isLoading;
  
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>اسم العميل</FormLabel>
              <FormControl>
                <div className="flex items-center space-x-2">
                  <User className="h-4 w-4 ml-2" />
                  <Input {...field} placeholder="اسم العميل" required />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>رقم الهاتف</FormLabel>
              <FormControl>
                <div className="flex items-center space-x-2">
                  <Phone className="h-4 w-4 ml-2" />
                  <Input {...field} placeholder="رقم الهاتف" type="tel" />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>البريد الإلكتروني</FormLabel>
              <FormControl>
                <div className="flex items-center space-x-2">
                  <Mail className="h-4 w-4 ml-2" />
                  <Input {...field} placeholder="البريد الإلكتروني" type="email" />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>العنوان</FormLabel>
              <FormControl>
                <div className="flex items-center space-x-2">
                  <Building className="h-4 w-4 ml-2" />
                  <Input {...field} placeholder="العنوان" />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>ملاحظات</FormLabel>
              <FormControl>
                <div className="flex items-start space-x-2">
                  <FileText className="h-4 w-4 ml-2 mt-3" />
                  <Textarea {...field} placeholder="ملاحظات إضافية" className="min-h-[80px]" />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <div className="flex justify-end space-x-2 pt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
            إلغاء
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "جاري الحفظ..." : customer ? "تحديث" : "إضافة"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
