
import { useState, useCallback, useRef } from "react";
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
import { toast } from "@/components/ui/sonner";
import { useNavigate } from "react-router-dom";
import { createProduct } from "@/services/supabase/productService";
import { CustomSwitch } from "@/components/ui/custom-switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Image, ScanLine, Upload } from "lucide-react";
import BarcodeScanner from "@/components/POS/BarcodeScanner";

// Form validation schema
const productFormSchema = z.object({
  name: z.string().min(2, {
    message: "يجب أن يحتوي اسم المنتج على حرفين على الأقل.",
  }),
  description: z.string().optional(),
  barcode: z.string().optional(),
  barcode_type: z.string().default("normal"),
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

// Barcode types
const barcodeTypes = [
  { id: "normal", name: "عادي" },
  { id: "scale", name: "ميزان" },
];

export default function AddProduct() {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [productImage, setProductImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showScanner, setShowScanner] = useState(false);

  // Initialize form with default values
  const form = useForm<z.infer<typeof productFormSchema>>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      name: "",
      description: "",
      barcode: "",
      barcode_type: "normal",
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

  // Handle image selection
  const handleImageChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setProductImage(file);
      
      // Create a preview URL
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  // Handle barcode scanning
  const handleBarcodeScanning = useCallback(() => {
    setShowScanner(true);
  }, []);

  // Handle barcode result
  const handleBarcodeResult = useCallback((barcode: string) => {
    form.setValue("barcode", barcode);
    toast.success(`تم مسح الباركود: ${barcode}`);
  }, [form]);

  // Handle drag and drop for image upload
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      
      // Check if the file is an image
      if (file.type.startsWith('image/')) {
        setProductImage(file);
        
        const reader = new FileReader();
        reader.onloadend = () => {
          setImagePreview(reader.result as string);
        };
        reader.readAsDataURL(file);
      } else {
        toast.error("الرجاء إرفاق ملف صورة فقط");
      }
    }
  }, []);

  // Open file dialog when clicking on the dropzone
  const openFileDialog = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Watch values for conditional rendering
  const isService = form.watch("is_service");
  const barcodeType = form.watch("barcode_type");

  // Handle form submission
  const onSubmit = async (values: z.infer<typeof productFormSchema>) => {
    try {
      setIsSubmitting(true);
      
      // If product is a service, set quantity to -1 and disable inventory tracking
      if (values.is_service) {
        values.quantity = -1;
      }
      
      // If offer is not enabled, remove offer price
      if (!values.is_offer) {
        values.offer_price = undefined;
      }
      
      // Format barcode for scale products if needed
      let formattedBarcode = values.barcode;
      if (values.barcode_type === "scale" && values.barcode) {
        // If user entered more than 6 digits, extract just the product code part
        if (values.barcode.length > 6) {
          formattedBarcode = values.barcode.substring(0, 6);
        }
        
        // Ensure it's exactly 6 digits by padding with zeros if needed
        while (formattedBarcode && formattedBarcode.length < 6) {
          formattedBarcode = '0' + formattedBarcode;
        }
      }
      
      // Create image URLs array - will be a placeholder if no image was uploaded
      const imageUrls = imagePreview 
        ? [imagePreview] 
        : ["/placeholder.svg"];
      
      // Remove track_inventory from the data we send to the database
      // since it's not supported in the schema yet
      const { track_inventory, ...productData } = values;
      
      // Add all required properties for the Product type
      await createProduct({
        name: productData.name,
        price: productData.price,
        purchase_price: productData.purchase_price,
        quantity: productData.quantity,
        description: productData.description,
        barcode: formattedBarcode,
        barcode_type: productData.barcode_type,
        is_offer: productData.is_offer,
        offer_price: productData.offer_price,
        image_urls: imageUrls,
        bulk_enabled: false,
        is_bulk: false,
        category_id: productData.category,
        unit_of_measure: productData.unit,
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

                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="barcode_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>نوع الباركود</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="اختر نوع الباركود" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {barcodeTypes.map((type) => (
                              <SelectItem key={type.id} value={type.id}>
                                {type.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          {field.value === "scale" 
                            ? "منتجات الميزان تحتاج إلى رمز خاص (6 أرقام)" 
                            : "الباركود العادي للمنتجات"}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex items-center gap-2">
                    <FormField
                      control={form.control}
                      name="barcode"
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormLabel>
                            {barcodeType === "scale" ? "رمز المنتج (6 أرقام)" : "الباركود"}
                          </FormLabel>
                          <div className="flex gap-2">
                            <FormControl>
                              <Input 
                                placeholder={barcodeType === "scale" ? "أدخل 1-6 أرقام" : "الباركود"}
                                {...field}
                              />
                            </FormControl>
                            <Button 
                              type="button" 
                              variant="outline" 
                              size="icon"
                              onClick={handleBarcodeScanning}
                              title="مسح الباركود باستخدام الكاميرا"
                            >
                              <ScanLine className="h-4 w-4" />
                            </Button>
                          </div>
                          {barcodeType === "scale" && field.value && (
                            <FormDescription>
                              رمز المنتج المخزن: {field.value.padStart(6, '0')}
                            </FormDescription>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Continue with the rest of the form fields */}
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

                <div className="space-y-6">
                  <div className="border p-4 rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium">خدمة (وليس منتج)</h3>
                        <p className="text-sm text-muted-foreground">الخدمات لا تحتاج إلى تتبع المخزون</p>
                      </div>
                      <FormField
                        control={form.control}
                        name="is_service"
                        render={({ field }) => (
                          <FormItem className="space-y-0">
                            <FormControl>
                              <CustomSwitch
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
                    </div>
                  </div>

                  <div className="border p-4 rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium">تتبع المخزون</h3>
                        <p className="text-sm text-muted-foreground">تنبيهات عند انخفاض المخزون</p>
                      </div>
                      <FormField
                        control={form.control}
                        name="track_inventory"
                        render={({ field }) => (
                          <FormItem className="space-y-0">
                            <FormControl>
                              <CustomSwitch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                disabled={form.watch("is_service")}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="is_offer"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">سعر العرض</FormLabel>
                        <FormDescription>
                          تفعيل سعر العرض للمنتج
                        </FormDescription>
                      </div>
                      <FormControl>
                        <CustomSwitch
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

              <div className="border rounded-lg p-4">
                <h3 className="font-medium mb-2">صورة المنتج</h3>
                <div className="flex items-start gap-4">
                  <div 
                    className={`h-32 w-32 border rounded-md overflow-hidden flex items-center justify-center bg-gray-50 cursor-pointer ${!imagePreview ? 'border-dashed' : ''}`}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onClick={openFileDialog}
                  >
                    {imagePreview ? (
                      <img 
                        src={imagePreview} 
                        alt="Product preview" 
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-gray-400 p-2">
                        <Image className="h-10 w-10 mb-1" />
                        <span className="text-xs text-center">اسحب صورة هنا</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <label 
                      htmlFor="product-image"
                      className="flex items-center gap-2 border rounded-md p-2 cursor-pointer hover:bg-gray-50"
                    >
                      <Upload className="h-4 w-4" />
                      <span>اختر صورة</span>
                      <input
                        id="product-image"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleImageChange}
                        ref={fileInputRef}
                      />
                    </label>
                    <p className="text-xs text-muted-foreground">
                      يمكنك تحميل صورة بصيغة JPG، PNG. الحد الأقصى 5 ميجابايت.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      يمكنك أيضاً سحب وإفلات الصورة مباشرة في المربع.
                    </p>
                  </div>
                </div>
              </div>

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
      
      <BarcodeScanner 
        isOpen={showScanner} 
        onClose={() => setShowScanner(false)}
        onScan={handleBarcodeResult}
      />
    </MainLayout>
  );
}
