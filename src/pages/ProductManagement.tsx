
import { useState } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { siteConfig } from "@/config/site";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { 
  Search, 
  Plus, 
  Pencil, 
  Trash2, 
  Package, 
  ArrowUpDown,
  MoreHorizontal,
  Tag
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Product } from "@/types";

// Demo products
const demoProducts: Product[] = [
  {
    id: "1",
    name: "سكر 1 كيلو",
    barcode: "6221031954818",
    imageUrls: ["/placeholder.svg"],
    quantity: 100,
    price: 45,
    purchasePrice: 40,
    isOffer: false,
    categoryId: "1",
    isBulk: false,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    id: "2",
    name: "زيت عباد الشمس 1 لتر",
    barcode: "6221031951255",
    imageUrls: ["/placeholder.svg"],
    quantity: 50,
    price: 60,
    purchasePrice: 52,
    isOffer: true,
    offerPrice: 55,
    categoryId: "1",
    isBulk: false,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    id: "3",
    name: "أرز مصري 5 كيلو",
    barcode: "6221031953392",
    imageUrls: ["/placeholder.svg"],
    quantity: 30,
    price: 180,
    purchasePrice: 160,
    isOffer: false,
    categoryId: "1",
    isBulk: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    id: "4",
    name: "شاي ليبتون 100 كيس",
    barcode: "6221031958762",
    imageUrls: ["/placeholder.svg"],
    quantity: 45,
    price: 120,
    purchasePrice: 110,
    isOffer: true,
    offerPrice: 115,
    categoryId: "2",
    isBulk: false,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    id: "5",
    name: "دقيق فاخر 1 كيلو",
    barcode: "6221031959124",
    imageUrls: ["/placeholder.svg"],
    quantity: 80,
    price: 35,
    purchasePrice: 30,
    isOffer: false,
    categoryId: "1",
    isBulk: false,
    createdAt: new Date(),
    updatedAt: new Date()
  }
];

export default function ProductManagement() {
  const [products, setProducts] = useState<Product[]>(demoProducts);
  const [search, setSearch] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  
  const filteredProducts = products.filter(product => 
    product.name.includes(search) || 
    product.barcode.includes(search)
  );
  
  return (
    <MainLayout>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">إدارة المنتجات</h1>
        <Button onClick={() => setIsAddDialogOpen(true)}>
          <Plus className="ml-2 h-4 w-4" />
          إضافة منتج جديد
        </Button>
      </div>
      
      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>المنتجات</CardTitle>
              <CardDescription>إدارة مخزون وأسعار المنتجات</CardDescription>
            </div>
            <Package className="h-5 w-5 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-6">
            <Input 
              placeholder="ابحث بالاسم أو الباركود" 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <Button variant="outline">
              <Search className="ml-2 h-4 w-4" />
              بحث
            </Button>
          </div>
          
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">صورة</TableHead>
                  <TableHead>
                    <div className="flex items-center">
                      المنتج
                      <ArrowUpDown className="mr-2 h-4 w-4" />
                    </div>
                  </TableHead>
                  <TableHead>الباركود</TableHead>
                  <TableHead className="text-left">السعر</TableHead>
                  <TableHead>المخزون</TableHead>
                  <TableHead className="text-left">الحالة</TableHead>
                  <TableHead className="text-left">خيارات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map(product => (
                  <TableRow key={product.id}>
                    <TableCell>
                      <div className="h-12 w-12 rounded bg-gray-100 flex items-center justify-center">
                        <img 
                          src={product.imageUrls[0]} 
                          alt={product.name}
                          className="h-8 w-8 object-contain"
                        />
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell>{product.barcode}</TableCell>
                    <TableCell>
                      {product.isOffer && product.offerPrice ? (
                        <div>
                          <span className="text-primary font-medium">{product.offerPrice} {siteConfig.currency}</span>
                          <span className="mr-2 text-xs text-muted-foreground line-through">{product.price} {siteConfig.currency}</span>
                        </div>
                      ) : (
                        <span>{product.price} {siteConfig.currency}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">{product.quantity}</TableCell>
                    <TableCell>
                      {product.quantity > 10 ? (
                        <span className="px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">متوفر</span>
                      ) : product.quantity > 0 ? (
                        <span className="px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-800">مخزون منخفض</span>
                      ) : (
                        <span className="px-2 py-1 rounded-full text-xs bg-red-100 text-red-800">غير متوفر</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>خيارات</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem>
                            <Pencil className="ml-2 h-4 w-4" />
                            تعديل
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive">
                            <Trash2 className="ml-2 h-4 w-4" />
                            حذف
                          </DropdownMenuItem>
                          {!product.isOffer && (
                            <DropdownMenuItem>
                              <Tag className="ml-2 h-4 w-4" />
                              إضافة عرض
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      
      {/* Add Product Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[625px]">
          <DialogHeader>
            <DialogTitle>إضافة منتج جديد</DialogTitle>
            <DialogDescription>
              أدخل تفاصيل المنتج. اضغط حفظ عند الانتهاء.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">اسم المنتج</Label>
                <Input id="name" placeholder="اسم المنتج" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="barcode">الباركود</Label>
                <Input id="barcode" placeholder="الباركود" />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="price">سعر البيع</Label>
                <Input id="price" type="number" placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="purchasePrice">سعر الشراء</Label>
                <Input id="purchasePrice" type="number" placeholder="0.00" />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quantity">الكمية</Label>
                <Input id="quantity" type="number" placeholder="0" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">الفئة</Label>
                <Input id="category" placeholder="الفئة" />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="image">صورة المنتج</Label>
              <Input id="image" type="file" />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit">حفظ المنتج</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
