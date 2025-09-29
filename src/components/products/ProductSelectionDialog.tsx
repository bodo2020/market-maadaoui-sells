import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Search, Package, LinkIcon } from "lucide-react";
import { Product } from "@/types";
import { fetchProducts } from "@/services/supabase/productService";
import { useToast } from "@/hooks/use-toast";

interface ProductSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectProduct: (product: Product) => void;
}

export default function ProductSelectionDialog({
  open,
  onOpenChange,
  onSelectProduct,
}: ProductSelectionDialogProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      loadProducts();
    }
  }, [open]);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const data = await fetchProducts();
      setProducts(data || []);
    } catch (error) {
      console.error('Error loading products:', error);
      toast({
        title: "خطأ",
        description: "فشل في تحميل المنتجات",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(search.toLowerCase()) ||
    (product.barcode && product.barcode.includes(search))
  );

  const handleSelectProduct = () => {
    if (selectedProduct) {
      onSelectProduct(selectedProduct);
      onOpenChange(false);
      setSelectedProduct(null);
      setSearch("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LinkIcon className="h-5 w-5" />
            اختيار المنتج الأساسي للربط
          </DialogTitle>
          <DialogDescription>
            اختر المنتج الذي تريد ربط المنتج الجديد به. ستتم مشاركة اسم المنتج وسعر الشراء والكمية
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="البحث عن منتج..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Products List */}
          <ScrollArea className="h-96">
            {loading ? (
              <div className="flex justify-center items-center py-8">
                <div className="text-muted-foreground">جاري تحميل المنتجات...</div>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 space-y-2">
                <Package className="h-8 w-8 text-muted-foreground" />
                <p className="text-muted-foreground">لا توجد منتجات متاحة للربط</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredProducts.map((product) => (
                  <Card
                    key={product.id}
                    className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                      selectedProduct?.id === product.id ? 'ring-2 ring-primary' : ''
                    }`}
                    onClick={() => setSelectedProduct(product)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center space-x-4 space-x-reverse">
                        {/* Product Image */}
                        <div className="flex-shrink-0">
                          {product.image_urls && product.image_urls.length > 0 ? (
                            <img
                              src={product.image_urls[0]}
                              alt={product.name}
                              className="w-16 h-16 object-cover rounded"
                            />
                          ) : (
                            <div className="w-16 h-16 bg-muted rounded flex items-center justify-center">
                              <Package className="h-6 w-6 text-muted-foreground" />
                            </div>
                          )}
                        </div>

                        {/* Product Info */}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-lg">{product.name}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            {product.barcode && (
                              <Badge variant="outline" className="text-xs">
                                {product.barcode}
                              </Badge>
                            )}
                            <span className="text-sm text-muted-foreground">
                              الكمية: {product.quantity}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 mt-2">
                            <span className="text-sm">
                              سعر البيع: <span className="font-medium">{product.price} ج.م</span>
                            </span>
                            <span className="text-sm">
                              سعر الشراء: <span className="font-medium">{product.purchase_price} ج.م</span>
                            </span>
                          </div>
                        </div>

                        {/* Selection Indicator */}
                        {selectedProduct?.id === product.id && (
                          <div className="flex-shrink-0">
                            <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                              <div className="w-2 h-2 bg-white rounded-full" />
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button
            onClick={handleSelectProduct}
            disabled={!selectedProduct}
          >
            اختيار المنتج
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}