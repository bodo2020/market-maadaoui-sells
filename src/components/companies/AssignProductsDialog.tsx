import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Package, Search } from "lucide-react";
import { 
  fetchProductsWithoutCompany,
  assignProductsToCompany,
  Company
} from "@/services/supabase/companyService";

interface Product {
  id: string;
  name: string;
  price: number;
  image_urls?: string[];
  barcode?: string;
}

interface AssignProductsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: Company;
  onSuccess: () => void;
}

export function AssignProductsDialog({
  open,
  onOpenChange,
  company,
  onSuccess
}: AssignProductsDialogProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (open) {
      loadProducts();
    }
  }, [open]);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const data = await fetchProductsWithoutCompany();
      setProducts(data || []);
    } catch (error) {
      console.error("Error loading products:", error);
      toast.error("حدث خطأ أثناء تحميل المنتجات");
    } finally {
      setLoading(false);
    }
  };

  const handleProductToggle = (productId: string) => {
    setSelectedProducts(prev => 
      prev.includes(productId)
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  const handleSelectAll = () => {
    const filtered = filteredProducts;
    if (selectedProducts.length === filtered.length) {
      setSelectedProducts([]);
    } else {
      setSelectedProducts(filtered.map(p => p.id));
    }
  };

  const handleAssign = async () => {
    if (selectedProducts.length === 0) {
      toast.error("يرجى اختيار منتج واحد على الأقل");
      return;
    }

    try {
      setLoading(true);
      await assignProductsToCompany(company.id, selectedProducts);
      toast.success(`تم إضافة ${selectedProducts.length} منتج للشركة بنجاح`);
      onSuccess();
      onOpenChange(false);
      setSelectedProducts([]);
    } catch (error) {
      console.error("Error assigning products:", error);
      toast.error("حدث خطأ أثناء إضافة المنتجات");
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    product.barcode?.includes(searchQuery)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>إضافة منتجات للشركة: {company.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search and Select All */}
          <div className="flex gap-4 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="البحث بالاسم أو الباركود..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button
              variant="outline"
              onClick={handleSelectAll}
              disabled={filteredProducts.length === 0}
            >
              {selectedProducts.length === filteredProducts.length ? "إلغاء تحديد الكل" : "تحديد الكل"}
            </Button>
          </div>

          {/* Products Count */}
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              إجمالي المنتجات: {filteredProducts.length}
            </p>
            <Badge variant="secondary">
              المحدد: {selectedProducts.length}
            </Badge>
          </div>

          {/* Products List */}
          <div className="border rounded-lg max-h-96 overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center">
                <p>جاري التحميل...</p>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="p-8 text-center">
                <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">
                  {searchQuery ? "لا توجد نتائج للبحث" : "لا توجد منتجات بدون شركة"}
                </p>
              </div>
            ) : (
              <div className="p-4 space-y-2">
                {filteredProducts.map((product) => (
                  <Card key={product.id} className="hover:bg-gray-50">
                    <CardContent className="p-4">
                      <div className="flex items-center space-x-4 space-x-reverse">
                        <Checkbox
                          checked={selectedProducts.includes(product.id)}
                          onCheckedChange={() => handleProductToggle(product.id)}
                        />
                        
                        {product.image_urls?.[0] && (
                          <img
                            src={product.image_urls[0]}
                            alt={product.name}
                            className="w-12 h-12 object-cover rounded"
                          />
                        )}
                        
                        <div className="flex-1">
                          <h4 className="font-medium">{product.name}</h4>
                          {product.barcode && (
                            <p className="text-sm text-muted-foreground">
                              الباركود: {product.barcode}
                            </p>
                          )}
                        </div>
                        
                        <div className="text-left">
                          <p className="font-semibold">{product.price} ج.م</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-2 space-x-reverse">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button 
              onClick={handleAssign}
              disabled={loading || selectedProducts.length === 0}
            >
              إضافة المنتجات المحددة ({selectedProducts.length})
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}