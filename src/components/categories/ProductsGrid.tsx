import { Product } from "@/types";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Edit, Package } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { siteConfig } from "@/config/site";

interface ProductsGridProps {
  products: Product[];
  onRefresh: () => void;
}

export default function ProductsGrid({ products, onRefresh }: ProductsGridProps) {
  const navigate = useNavigate();

  if (products.length === 0) {
    return (
      <div className="text-center py-8 bg-gray-50 rounded-lg border">
        <Package className="h-12 w-12 text-gray-300 mx-auto mb-3" />
        <h3 className="text-lg font-medium">لا توجد منتجات</h3>
        <p className="text-gray-500 mb-4">لم يتم إضافة أي منتجات بعد</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {products.map((product) => (
        <Card key={product.id} className="flex flex-col">
          <CardContent className="p-4">
            <div className="aspect-square rounded-lg bg-gray-100 mb-4 overflow-hidden">
              <img
                src={product.image_urls?.[0] || "/placeholder.svg"}
                alt={product.name}
                className="w-full h-full object-cover"
              />
            </div>
            <h3 className="font-medium mb-2">{product.name}</h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-gray-500">السعر</span>
                <div>
                  {product.is_offer && product.offer_price ? (
                    <div>
                      <span className="text-primary font-medium">
                        {product.offer_price} {siteConfig.currency}
                      </span>
                      <span className="mr-2 text-xs text-muted-foreground line-through">
                        {product.price} {siteConfig.currency}
                      </span>
                    </div>
                  ) : (
                    <span>{product.price} {siteConfig.currency}</span>
                  )}
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500">المخزون</span>
                <Badge 
                  variant={
                    product.quantity > 10 ? "secondary" : 
                    product.quantity > 0 ? "default" : 
                    "destructive"
                  }
                >
                  {product.quantity} وحدة
                </Badge>
              </div>
            </div>
          </CardContent>
          <CardFooter className="mt-auto p-4 pt-0">
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => navigate(`/products/edit/${product.id}`)}
            >
              <Edit className="ml-2 h-4 w-4" />
              تعديل المنتج
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
