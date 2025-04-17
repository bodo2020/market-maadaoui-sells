import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { ImageUpload } from "@/components/ui/image-upload";
import { createProduct } from "@/services/supabase/productService";
import { toast } from "sonner";

interface AddProductDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onProductAdded: () => void;
  companyId: string;
  categories: Array<{ id: string; name: string }>;
  subcategories: Array<{ id: string; name: string }>;
  subsubcategories: Array<{ id: string; name: string }>;
  selectedCategory: string | null;
  selectedSubcategory: string | null;
  selectedSubsubcategory: string | null;
  onCategoryChange: (categoryId: string | null) => void;
  onSubcategoryChange: (subcategoryId: string | null) => void;
  onSubsubcategoryChange: (subsubcategoryId: string | null) => void;
}

export function AddProductDialog({
  isOpen,
  onClose,
  onProductAdded,
  companyId,
  categories,
  subcategories,
  subsubcategories,
  selectedCategory,
  selectedSubcategory,
  selectedSubsubcategory,
  onCategoryChange,
  onSubcategoryChange,
  onSubsubcategoryChange,
}: AddProductDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState<number | ''>('');
  const [purchasePrice, setPurchasePrice] = useState<number | ''>('');
  const [quantity, setQuantity] = useState<number | ''>('');
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [barcode, setBarcode] = useState('');
  const [barcodeType, setBarcodeType] = useState<'normal' | 'scale'>('normal');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !price || !purchasePrice) {
      toast.error("يرجى ملء جميع الحقول المطلوبة");
      return;
    }

    try {
      setLoading(true);
      await createProduct({
        name,
        description: description || null,
        price: Number(price),
        purchase_price: Number(purchasePrice),
        quantity: quantity ? Number(quantity) : 0,
        image_urls: images,
        company_id: companyId,
        category_id: selectedCategory,
        subcategory_id: selectedSubcategory,
        subsubcategory_id: selectedSubsubcategory,
        barcode: barcode || null,
        barcode_type: barcodeType,
        bulk_enabled: false,
        is_bulk: false,
        is_offer: false,
      });

      toast.success("تم إضافة المنتج بنجاح");
      onProductAdded();
      handleClose();
    } catch (error) {
      console.error("Error adding product:", error);
      toast.error("حدث خطأ أثناء إضافة المنتج");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setName("");
    setDescription("");
    setPrice('');
    setPurchasePrice('');
    setQuantity('');
    setImages([]);
    setBarcode('');
    setBarcodeType('normal');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إضافة منتج جديد</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">اسم المنتج</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="أدخل اسم المنتج"
              required
            />
          </div>
          
          <div>
            <Label htmlFor="description">الوصف (اختياري)</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="أدخل وصف المنتج"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="price">السعر</Label>
              <Input
                id="price"
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value ? Number(e.target.value) : '')}
                placeholder="أدخل السعر"
                required
              />
            </div>
            <div>
              <Label htmlFor="purchasePrice">سعر الشراء</Label>
              <Input
                id="purchasePrice"
                type="number"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value ? Number(e.target.value) : '')}
                placeholder="أدخل سعر الشراء"
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="quantity">الكمية</Label>
            <Input
              id="quantity"
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value ? Number(e.target.value) : '')}
              placeholder="أدخل الكمية"
            />
          </div>

          <div className="space-y-4">
            <div>
              <Label>القسم</Label>
              <select
                className="w-full p-2 border rounded-md mt-1"
                value={selectedCategory || ''}
                onChange={(e) => onCategoryChange(e.target.value || null)}
              >
                <option value="">اختر القسم</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedCategory && (
              <div>
                <Label>القسم الفرعي</Label>
                <select
                  className="w-full p-2 border rounded-md mt-1"
                  value={selectedSubcategory || ''}
                  onChange={(e) => onSubcategoryChange(e.target.value || null)}
                >
                  <option value="">اختر القسم الفرعي</option>
                  {subcategories.map((subcategory) => (
                    <option key={subcategory.id} value={subcategory.id}>
                      {subcategory.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {selectedSubcategory && (
              <div>
                <Label>الفئة</Label>
                <select
                  className="w-full p-2 border rounded-md mt-1"
                  value={selectedSubsubcategory || ''}
                  onChange={(e) => onSubsubcategoryChange(e.target.value || null)}
                >
                  <option value="">اختر الفئة</option>
                  {subsubcategories.map((subsubcategory) => (
                    <option key={subsubcategory.id} value={subsubcategory.id}>
                      {subsubcategory.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div>
            <Label>صور المنتج</Label>
            <ImageUpload
              value={images}
              onChange={setImages}
              onRemove={(url) => setImages(images.filter((image) => image !== url))}
            />
          </div>

          <div>
            <Label htmlFor="barcodeType">نوع الباركود</Label>
            <select
              id="barcodeType"
              value={barcodeType}
              onChange={(e) => setBarcodeType(e.target.value as 'normal' | 'scale')}
              className="w-full p-2 border rounded-md mt-1"
            >
              <option value="normal">عادي</option>
              <option value="scale">ميزان</option>
            </select>
          </div>

          <div>
            <Label htmlFor="barcode">الباركود (اختياري)</Label>
            <Input
              id="barcode"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="أدخل الباركود"
            />
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={handleClose}>
              إلغاء
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  جاري الإضافة...
                </>
              ) : (
                "إضافة"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
