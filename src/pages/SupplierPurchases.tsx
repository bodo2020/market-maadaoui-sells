import React, { useState, useEffect } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Product, CartItem } from '@/types';
import { toast } from 'sonner';
import { Search } from 'lucide-react';
import { ScrollArea } from "@/components/ui/scroll-area"

export default function SupplierPurchases() {
  const [searchTerm, setSearchTerm] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [supplier, setSupplier] = useState({
    id: "1",
    name: "Sample Supplier",
    phone: "123-456-7890",
    address: "123 Main St",
    email: "supplier@example.com",
    contact_person: "John Doe",
    notes: "Reliable supplier",
    balance: 1000,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  useEffect(() => {
    // Mock products data
    const mockProducts = [
      {
        id: "1",
        name: "Sample Product 1",
        price: 100,
        purchase_price: 80,
        quantity: 50,
        image_urls: [],
        is_offer: false,
        bulk_enabled: false,
        is_bulk: false,
        created_at: new Date().toISOString()
      },
      {
        id: "2",
        name: "Sample Product 2",
        price: 150,
        purchase_price: 120,
        quantity: 30,
        image_urls: [],
        is_offer: true,
        offer_price: 130,
        bulk_enabled: true,
        bulk_price: 110,
        bulk_quantity: 10,
        is_bulk: false,
        created_at: new Date().toISOString()
      },
      {
        id: "3",
        name: "Sample Product 3",
        price: 200,
        purchase_price: 160,
        quantity: 40,
        image_urls: [],
        is_offer: false,
        bulk_enabled: false,
        is_bulk: true,
        created_at: new Date().toISOString()
      }
    ];
    setProducts(mockProducts);
  }, []);

  // Update the sample cartItems to include weight property
  const cartItems = [
    {
      product: {
        id: "1",
        name: "Sample Product 1",
        price: 100,
        purchase_price: 80,
        quantity: 50,
        image_urls: [],
        is_offer: false,
        bulk_enabled: false,
        is_bulk: false,
        created_at: new Date().toISOString()
      },
      quantity: 5,
      price: 100,
      discount: 0,
      total: 500,
      weight: null
    }
  ];

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAddToCart = (product: Product) => {
    const existingItemIndex = cart.findIndex(item => item.product.id === product.id);

    if (existingItemIndex >= 0) {
      const newCart = [...cart];
      newCart[existingItemIndex].quantity += 1;
      newCart[existingItemIndex].total = newCart[existingItemIndex].quantity * newCart[existingItemIndex].price;
      setCart(newCart);
    } else {
      const newItem: CartItem = {
        product,
        quantity: 1,
        price: product.is_offer && product.offer_price ? product.offer_price : product.price,
        discount: product.is_offer && product.offer_price ? product.price - product.offer_price : 0,
        total: product.is_offer && product.offer_price ? product.offer_price : product.price,
        weight: null
      };
      setCart([...cart, newItem]);
    }

    toast.success(`${product.name} added to cart`);
  };

  const handleRemoveFromCart = (productId: string) => {
    const newCart = cart.filter(item => item.product.id !== productId);
    setCart(newCart);
    toast.info(`Product removed from cart`);
  };

  const handleQuantityChange = (productId: string, quantity: number) => {
    if (quantity < 0) return;

    const newCart = cart.map(item => {
      if (item.product.id === productId) {
        item.quantity = quantity;
        item.total = item.quantity * item.price;
      }
      return item;
    });

    setCart(newCart);
  };

  const calculateSubtotal = () => {
    return cart.reduce((total, item) => total + item.total, 0);
  };

  const calculateTotal = () => {
    const subtotal = calculateSubtotal();
    return subtotal;
  };

  return (
    <div className="container mx-auto p-4 dir-rtl">
      <Card>
        <CardHeader>
          <CardTitle>فاتورة مشتريات من مورد</CardTitle>
          <CardDescription>
            إدارة مشترياتك من مورد معين
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="supplier">اسم المورد</Label>
              <Input id="supplier" value={supplier.name} disabled />
            </div>
            <div>
              <Label htmlFor="phone">رقم الهاتف</Label>
              <Input id="phone" value={supplier.phone} disabled />
            </div>
            <div>
              <Label htmlFor="email">البريد الإلكتروني</Label>
              <Input id="email" value={supplier.email} disabled />
            </div>
            <div>
              <Label htmlFor="address">العنوان</Label>
              <Input id="address" value={supplier.address} disabled />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>قائمة المنتجات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="ابحث عن منتج..."
                className="pl-10 pr-10"
                onChange={handleSearch}
              />
            </div>
            <ScrollArea className="h-[400px] mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">اسم المنتج</TableHead>
                    <TableHead className="text-center">السعر</TableHead>
                    <TableHead className="text-center">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map(product => (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell className="text-center">{product.price}</TableCell>
                      <TableCell className="text-center">
                        <Button size="sm" onClick={() => handleAddToCart(product)}>
                          إضافة إلى السلة
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>سلة المشتريات</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">اسم المنتج</TableHead>
                    <TableHead className="text-center">الكمية</TableHead>
                    <TableHead className="text-center">السعر</TableHead>
                    <TableHead className="text-center">المجموع</TableHead>
                    <TableHead className="text-center">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cart.map(item => (
                    <TableRow key={item.product.id}>
                      <TableCell className="font-medium">{item.product.name}</TableCell>
                      <TableCell className="text-center">
                        <Input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => handleQuantityChange(item.product.id, Number(e.target.value))}
                          className="w-20 mx-auto text-center"
                        />
                      </TableCell>
                      <TableCell className="text-center">{item.price}</TableCell>
                      <TableCell className="text-center">{item.total}</TableCell>
                      <TableCell className="text-center">
                        <Button size="sm" variant="destructive" onClick={() => handleRemoveFromCart(item.product.id)}>
                          حذف
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={3}>المجموع الفرعي</TableCell>
                    <TableCell className="text-center">{calculateSubtotal()}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={3}>الإجمالي</TableCell>
                    <TableCell className="text-center">{calculateTotal()}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </ScrollArea>
            <Button className="w-full mt-4">تأكيد الشراء</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
