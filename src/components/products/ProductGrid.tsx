
import { Card, CardContent } from "@/components/ui/card";
import { Product } from "@/types";

interface ProductGridProps {
  products: Product[];
}

export function ProductGrid({ products }: ProductGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {products.map((product) => (
        <Card key={product.id} className="overflow-hidden">
          <CardContent className="p-4">
            <div className="aspect-square w-full relative mb-4">
              {product.image_urls && product.image_urls[0] ? (
                <img 
                  src={product.image_urls[0]} 
                  alt={product.name}
                  className="w-full h-full object-cover rounded-md"
                />
              ) : (
                <div className="w-full h-full bg-gray-100 rounded-md flex items-center justify-center">
                  <span className="text-gray-400">No image</span>
                </div>
              )}
            </div>
            <h3 className="font-semibold text-lg mb-1">{product.name}</h3>
            <p className="text-sm text-gray-500 mb-2">{product.description}</p>
            <div className="flex justify-between items-center">
              <span className="font-medium">Price: ${product.price}</span>
              <span className="text-sm text-gray-500">Qty: {product.quantity}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
