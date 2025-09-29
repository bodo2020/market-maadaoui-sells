
import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Product, ProductVariant } from "@/types";
import { Package, Layers } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface ProductGridProps {
  products: Product[];
  onEditProduct: (product: Product) => void;
}

export function ProductGrid({ products, onEditProduct }: ProductGridProps) {
  const navigate = useNavigate();

  // Add console logs to debug
  console.log("ProductGrid received products:", products);

  if (!products || products.length === 0) {
    return (
      <div className="text-center py-12">
        <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <p className="text-xl text-gray-500">
          لا توجد منتجات حالياً
        </p>
      </div>
    );
  }

  const handleProductClick = (productId: string) => {
    navigate(`/add-product?id=${productId}`);
  };

  const renderProductVariants = (variants: ProductVariant[]) => {
    if (!variants || variants.length === 0) return null;
    
    return (
      <div className="mt-2 space-y-1">
        <div className="flex items-center gap-1 text-xs text-gray-600">
          <Layers className="h-3 w-3" />
          <span>الأصناف المتاحة:</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {variants.slice(0, 3).map((variant) => (
            <Badge key={variant.id} variant="outline" className="text-xs">
              {variant.name} - {variant.price} ج.م
            </Badge>
          ))}
          {variants.length > 3 && (
            <Badge variant="outline" className="text-xs">
              +{variants.length - 3} أكثر
            </Badge>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {products.map((product) => (
        <Card 
          key={product.id} 
          className="overflow-hidden hover:shadow-lg transition-all duration-200 cursor-pointer"
          onClick={() => handleProductClick(product.id)}
        >
          <div className="aspect-video w-full relative">
            <img
              src={product.image_urls?.[0] || "/placeholder.svg"}
              alt={product.name}
              className="w-full h-full object-contain bg-gray-50 p-2"
            />
            {product.has_variants && (
              <div className="absolute top-2 left-2">
                <Badge variant="secondary" className="text-xs">
                  <Layers className="h-3 w-3 mr-1" />
                  أصناف متعددة
                </Badge>
              </div>
            )}
          </div>
          <CardContent className="p-4">
            <h3 className="font-medium truncate">{product.name}</h3>
            {product.description && (
              <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                {product.description}
              </p>
            )}
            <div className="space-y-2 mt-2">
              <div className="flex justify-between items-center">
                <div className="space-y-1">
                  <div className="text-sm font-medium">
                    {product.has_variants ? 
                      `من ${Math.min(...(product.variants?.map(v => v.price) || [product.price]))} ج.م` 
                      : `${product.price} ج.م`
                    }
                  </div>
                  <Badge variant="outline" className="text-xs">
                    المخزون: {product.quantity || 0} {product.base_unit || 'قطعة'}
                  </Badge>
                </div>
                {product.bulk_enabled && (
                  <Badge variant="secondary" className="text-xs">
                    متاح بالجملة
                  </Badge>
                )}
              </div>
              
              {/* عرض الأصناف إذا كانت متوفرة */}
              {product.has_variants && product.variants && renderProductVariants(product.variants)}
              
              <div className="flex gap-2 text-xs text-gray-500">
                <Badge variant="outline" className="text-xs">
                  {product.barcode_type === 'scale' ? 'باركود ميزان' : 'باركود عادي'}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
