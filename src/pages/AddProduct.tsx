
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/components/ui/sonner";
import { useNavigate } from "react-router-dom";
import { createProduct } from "@/services/supabase/productService";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Form validation schema
const productFormSchema = z.object({
  name: z.string().min(2, {
    message: "يجب أن يحتوي اسم المنتج على حرفين على الأقل.",
  }),
  description: z.string().optional(),
  barcode: z.string().optional(),
  category: z.string(),
  price: z.coerce.number().positive({
    message: "يجب أن يكون السعر رقمًا موجبًا.",
  }),
  purchase_price: z.coerce.number().positive({
    message: "يجب أن يكون سعر الشراء رقمًا موجبًا.",
  }),
  quantity: z.coerce.number().nonnegative({
    message: "يجب أن تكون الكمية صفر أو أكثر.",
  }),
  is_offer: z.boolean().default(false),
  offer_price: z.coerce.number().positive({
    message: "يجب أن يكون سعر العرض رقمًا موجبًا.",
  }).optional(),
  is_service: z.boolean().default(false),
  track_inventory: z.boolean().default(true),
  unit: z.string().default("قطعة"),
});

// Product categories
const categories = [
  { id: "electronics", name: "إلكترونيات" },
  { id: "clothing", name: "ملابس" },
  { id: "food", name: "مواد غذائية" },
  { id: "home", name: "منزل" },
  { id: "beauty", name: "العناية الشخصية" },
  { id: "toys", name: "ألعاب" },
  { id: "sports", name: "رياضة" },
  { id: "books", name: "كتب" },
  { id: "others", name: "أخرى" },
];

// Product units
const units = [
  { id: "piece", name: "قطعة" },
  { id: "kg", name: "كيلوجرام" },
  { id: "g", name: "جرام" },
  { id: "l", name: "لتر" },
  { id: "ml", name: "مليلتر" },
  { id: "m", name: "متر" },
  { id: "cm", name: "سنتيمتر" },
  { id: "box", name: "صندوق" },
  { id: "bottle", name: "زجاجة" },
  { id: "packet", name: "عبوة" },
];

export default function AddProduct() {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize form with default values
  const form = useForm<z.infer<typeof productFormSchema>>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      name: "",
      description: "",
      barcode: "",
      category: "others",
      price: 0,
      purchase_price: 0,
      quantity: 0,
      is_offer: false,
      offer_price: undefined,
      is_service: false,
      track_inventory: true,
      unit: "قطعة",
    },
  });

  // Handle form submission
  const onSubmit = async (values: z.infer<typeof productFormSchema>) => {
    try {
      setIsSubmitting(true);
      
      // If product is a service, set quantity to -1 and disable inventory tracking
      if (values.is_service) {
        values.quantity = -1;
        values.track_inventory = false;
      }
      
      // If offer is not enabled, remove offer price
      if (!values.is_offer) {
        values.offer_price = undefined;
      }
      
      // Modified this line to remove the id property which was causing the error
      await createProduct({
        ...values,
        created_at: new Date().toISOString(),
      });
      
      toast.success("تم إضافة المنتج بنجاح");
      navigate("/products");
    } catch (error) {
      console.error("Error adding product:", error);
      toast.error("حدث خطأ أثناء إضافة المنتج");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <MainLayout>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">إضافة منتج جديد</h1>
        <Button variant="outline" onClick={() => navigate("/products")}>
          العودة إلى المنتجات
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>معلومات المنتج</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>اسم المنتج *</FormLabel>
                      <FormControl>
                        <Input placeholder="اسم المنتج" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="barcode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الباركود</FormLabel>
                      <FormControl>
                        <Input placeholder="الباركود (اختياري)" {...field} />
                      </FormControl>
                      <FormDescription>
                        يمكنك إضافة الباركود يدويًا أو تركه فارغًا
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>تصنيف المنتج *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="اختر تصنيف" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {categories.map((category) => (
                            <SelectItem key={category.id} value={category.id}>
                              {category.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="unit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>وحدة القياس *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="اختر وحدة القياس" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {units.map((unit) => (
                            <SelectItem key={unit.id} value={unit.name}>
                              {unit.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>سعر البيع *</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="purchase_price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>سعر الشراء *</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الكمية *</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          {...field} 
                          disabled={form.watch("is_service")} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="is_service"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel>خدمة (وليس منتج)</FormLabel>
                          <FormDescription>
                            الخدمات لا تحتاج إلى تتبع المخزون
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={(checked) => {
                              field.onChange(checked);
                              if (checked) {
                                form.setValue("track_inventory", false);
                              }
                            }}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="track_inventory"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel>تتبع المخزون</FormLabel>
                          <FormDescription>
                            تنبيهات عند انخفاض المخزون
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={form.watch("is_service")}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="is_offer"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <FormLabel>عرض</FormLabel>
                        <FormDescription>
                          تفعيل سعر العرض للمنتج
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="offer_price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>سعر العرض</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          {...field}
                          value={field.value || ""}
                          onChange={(e) => {
                            const value = e.target.value ? parseFloat(e.target.value) : undefined;
                            field.onChange(value);
                          }}
                          disabled={!form.watch("is_offer")}
                          placeholder="0.00"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>وصف المنتج</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="وصف المنتج (اختياري)"
                        className="resize-none"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/products")}
                >
                  إلغاء
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "جاري الإضافة..." : "إضافة المنتج"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </MainLayout>
  );
}
