
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createProduct } from "@/services/supabase/productService";
import { Textarea } from "@/components/ui/textarea";
import { useNavigate } from "react-router-dom";
import { Checkbox } from "@/components/ui/checkbox";

const productSchema = z.object({
  name: z.string().min(2, { message: "يجب أن يحتوي اسم المنتج على حرفين على الأقل" }),
  description: z.string().optional(),
  barcode: z.string().optional(),
  barcode_type: z.string().default("normal"),
  price: z.coerce.number().positive({ message: "يجب أن يكون السعر رقمًا موجبًا" }),
  purchase_price: z.coerce.number().positive({ message: "يجب أن يكون سعر الشراء رقمًا موجبًا" }),
  quantity: z.coerce.number().nonnegative({ message: "يجب أن تكون الكمية صفر أو أكثر" }),
  category_id: z.string().optional(),
  subcategory_id: z.string().optional(),
  unit_of_measure: z.string().default("قطعة"),
  offer_price: z.coerce.number().nullable().optional(),
  is_offer: z.boolean().default(false),
});

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
  { id: "packet", name: "عبوة" }
];

interface AddProductDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onProductAdded: () => void;
  companyId: string;
  categories: Array<{ id: string; name: string }>;
  subcategories: Array<{ id: string; name: string }>;
  selectedCategory: string | null;
  selectedSubcategory: string | null;
  onCategoryChange: (categoryId: string | null) => void;
  onSubcategoryChange: (subcategoryId: string | null) => void;
}

export function AddProductDialog({
  isOpen,
  onClose,
  onProductAdded,
  companyId,
  categories,
  subcategories,
  selectedCategory,
  selectedSubcategory,
  onCategoryChange,
  onSubcategoryChange
}: AddProductDialogProps) {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const form = useForm<z.infer<typeof productSchema>>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: "",
      description: "",
      barcode: "",
      barcode_type: "normal",
      price: 0,
      purchase_price: 0,
      quantity: 0,
      category_id: selectedCategory || undefined,
      subcategory_id: selectedSubcategory || undefined,
      unit_of_measure: "قطعة",
      offer_price: null,
      is_offer: false,
    },
  });

  // تحديث نموذج الإدخال عند تغيير التصنيف
  useEffect(() => {
    form.setValue('category_id', selectedCategory || undefined);
  }, [selectedCategory, form]);

  useEffect(() => {
    form.setValue('subcategory_id', selectedSubcategory || undefined);
  }, [selectedSubcategory, form]);

  const handleClose = () => {
    form.reset();
    onClose();
  };

  const onSubmit = async (values: z.infer<typeof productSchema>) => {
    try {
      setLoading(true);
      
      const productData = {
        name: values.name,
        description: values.description,
        barcode: values.barcode,
        barcode_type: values.barcode_type,
        price: values.price,
        purchase_price: values.purchase_price,
        quantity: values.quantity,
        image_urls: ["/placeholder.svg"],
        company_id: companyId,
        main_category_id: values.category_id, // تم تغييرها من category_id إلى main_category_id
        subcategory_id: values.subcategory_id,
        unit_of_measure: values.unit_of_measure,
        is_offer: values.is_offer,
        offer_price: values.offer_price,
        bulk_enabled: false,
        is_bulk: false,
        bulk_quantity: null,
        bulk_price: null,
        bulk_barcode: null,
        manufacturer_name: null
      };
      
      await createProduct(productData);
      toast.success("تم إضافة المنتج بنجاح");
      handleClose();
      onProductAdded();
    } catch (error) {
      console.error("Error creating product:", error);
      toast.error("حدث خطأ أثناء إنشاء المنتج");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>إضافة منتج جديد</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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

            <div className="grid grid-cols-2 gap-4">
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
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Added offer price field */}
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
                        placeholder="سعر العرض"
                        value={field.value === null ? '' : field.value}
                        onChange={(e) => {
                          const value = e.target.value === '' ? null : Number(e.target.value);
                          field.onChange(value);
                        }} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Added is_offer checkbox */}
              <FormField
                control={form.control}
                name="is_offer"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rtl:space-x-reverse">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel className="font-normal">منتج في العروض</FormLabel>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>الكمية *</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="unit_of_measure"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>وحدة القياس</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="وحدة القياس" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {units.map(unit => (
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
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="barcode_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>نوع الباركود</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="نوع الباركود" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="normal">عادي</SelectItem>
                        <SelectItem value="scale">ميزان</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="barcode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>الباركود (اختياري)</FormLabel>
                    <FormControl>
                      <Input placeholder="باركود المنتج" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="category_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>القسم الرئيسي</FormLabel>
                  <Select
                    value={field.value || "none"}
                    onValueChange={(value) => {
                      const categoryId = value === "none" ? undefined : value;
                      field.onChange(categoryId);
                      onCategoryChange(categoryId || null);
                    }}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="اختر القسم الرئيسي" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">بدون قسم</SelectItem>
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

            {selectedCategory && (
              <FormField
                control={form.control}
                name="subcategory_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>القسم الفرعي</FormLabel>
                    <Select
                      value={field.value || "none"}
                      onValueChange={(value) => {
                        const subcategoryId = value === "none" ? undefined : value;
                        field.onChange(subcategoryId);
                        onSubcategoryChange(subcategoryId || null);
                      }}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="اختر القسم الفرعي" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">بدون قسم فرعي</SelectItem>
                        {subcategories.map((subcategory) => (
                          <SelectItem key={subcategory.id} value={subcategory.id}>
                            {subcategory.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

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

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                إلغاء
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    جاري الإضافة...
                  </>
                ) : (
                  "إضافة المنتج"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
