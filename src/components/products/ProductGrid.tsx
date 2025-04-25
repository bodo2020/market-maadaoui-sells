
import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Product } from "@/types";
import { Package } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface ProductGridProps {
  products: Product[];
  onEditProduct: (product: Product) => void;
}

export function ProductGrid({ products, onEditProduct }: ProductGridProps) {
  const navigate = useNavigate();

  if (products.length === 0) {
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
                    {product.price} ج.م
                  </div>
                  <Badge variant="outline" className="text-xs">
                    المخزون: {product.quantity || 0}
                  </Badge>
                </div>
                {product.bulk_enabled && (
                  <Badge variant="secondary" className="text-xs">
                    متاح بالجملة
                  </Badge>
                )}
              </div>
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

