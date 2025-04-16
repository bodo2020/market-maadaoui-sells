
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
  Tag,
  Barcode,
  Box
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
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

// Demo products
const demoProducts: Product[] = [
  {
    id: "1",
    name: "سكر 1 كيلو",
    barcode: "6221031954818",
    image_urls: ["/placeholder.svg"],
    quantity: 100,
    price: 45,
    purchase_price: 40,
    is_offer: false,
    category_id: "1",
    is_bulk: false,
    barcode_type: "normal",
    bulk_enabled: false,
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    id: "2",
    name: "زيت عباد الشمس 1 لتر",
    barcode: "6221031951255",
    image_urls: ["/placeholder.svg"],
    quantity: 50,
    price: 60,
    purchase_price: 52,
    is_offer: true,
    offer_price: 55,
    category_id: "1",
    is_bulk: false,
    barcode_type: "normal",
    bulk_enabled: false,
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    id: "3",
    name: "أرز مصري 5 كيلو",
    barcode: "6221031953392",
    image_urls: ["/placeholder.svg"],
    quantity: 30,
    price: 180,
    purchase_price: 160,
    is_offer: false,
    category_id: "1",
    is_bulk: true,
    barcode_type: "normal",
    bulk_enabled: true,
    bulk_quantity: 5,
    bulk_price: 850,
    bulk_barcode: "6221031953393",
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    id: "4",
    name: "شاي ليبتون 100 كيس",
    barcode: "6221031958762",
    image_urls: ["/placeholder.svg"],
    quantity: 45,
    price: 120,
    purchase_price: 110,
    is_offer: true,
    offer_price: 115,
    category_id: "2",
    is_bulk: false,
    barcode_type: "normal",
    bulk_enabled: false,
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    id: "5",
    name: "تفاح أحمر",
    barcode: "2000123456789",
    image_urls: ["/placeholder.svg"],
    quantity: 80,
    price: 35,
    purchase_price: 30,
    is_offer: false,
    category_id: "1",
    is_bulk: false,
    barcode_type: "scale",
    bulk_enabled: false,
    created_at: new Date(),
    updated_at: new Date()
  }
];

export default function ProductManagement() {
  const [products, setProducts] = useState<Product[]>(demoProducts);
  const [search, setSearch] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newProduct, setNewProduct] = useState<Partial<Product>>({
    barcode_type: "normal",
    bulk_enabled: false,
  });
  const { toast } = useToast();
  
  const filteredProducts = products.filter(product => 
    product.name.includes(search) || 
    product.barcode.includes(search)
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value, type } = e.target;
    setNewProduct({
      ...newProduct,
      [id]: type === "number" ? Number(value) : value
    });
  };

  const handleSelectChange = (value: string, field: string) => {
    setNewProduct({
      ...newProduct,
      [field]: value
    });
  };

  const handleCheckboxChange = (checked: boolean, field: string) => {
    setNewProduct({
      ...newProduct,
      [field]: checked
    });
  };

  const handleSaveProduct = () => {
    if (!newProduct.name || !newProduct.barcode || !newProduct.price || !newProduct.purchase_price) {
      toast({
        title: "خطأ",
        description: "يرجى ملء جميع الحقول المطلوبة",
        variant: "destructive"
      });
      return;
    }

    // Validate scale barcode
    if (newProduct.barcode_type === "scale" && !newProduct.barcode?.startsWith("2")) {
      toast({
        title: "خطأ",
        description: "باركود الميزان يجب أن يبدأ بالرقم 2",
        variant: "destructive"
      });
      return;
    }

    // Add the new product
    const productToAdd: Product = {
      id: Math.random().toString().slice(2, 10),
      name: newProduct.name || "",
      barcode: newProduct.barcode || "",
      image_urls: ["/placeholder.svg"],
      quantity: newProduct.quantity || 0,
      price: newProduct.price || 0,
      purchase_price: newProduct.purchase_price || 0,
      is_offer: false,
      category_id: newProduct.category_id || "1",
      is_bulk: newProduct.bulk_enabled || false,
      barcode_type: newProduct.barcode_type || "normal",
      bulk_enabled: newProduct.bulk_enabled || false,
      bulk_quantity: newProduct.bulk_quantity,
      bulk_price: newProduct.bulk_price,
      bulk_barcode: newProduct.bulk_barcode,
      created_at: new Date(),
      updated_at: new Date()
    };

    setProducts([...products, productToAdd]);
    setNewProduct({
      barcode_type: "normal",
      bulk_enabled: false,
    });
    setIsAddDialogOpen(false);
    
    toast({
      title: "تم بنجاح",
      description: "تم إضافة المنتج بنجاح",
    });
  };
  
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
                  <TableHead>نوع الباركود</TableHead>
                  <TableHead className="text-left">السعر</TableHead>
                  <TableHead>المخزون</TableHead>
                  <TableHead>بيع بالجملة</TableHead>
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
                          src={product.image_urls[0]} 
                          alt={product.name}
                          className="h-8 w-8 object-contain"
                        />
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell>{product.barcode}</TableCell>
                    <TableCell>
                      {product.barcode_type === "scale" ? (
                        <span className="px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">ميزان</span>
                      ) : (
                        <span className="px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-800">عادي</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {product.is_offer && product.offer_price ? (
                        <div>
                          <span className="text-primary font-medium">{product.offer_price} {siteConfig.currency}</span>
                          <span className="mr-2 text-xs text-muted-foreground line-through">{product.price} {siteConfig.currency}</span>
                        </div>
                      ) : (
                        <span>{product.price} {siteConfig.currency}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">{product.quantity}</TableCell>
                    <TableCell>
                      {product.bulk_enabled ? (
                        <div className="flex items-center">
                          <Box className="h-4 w-4 text-green-600 mr-1" />
                          <span className="text-xs">
                            {product.bulk_quantity} وحدة - {product.bulk_price} {siteConfig.currency}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">غير متاح</span>
                      )}
                    </TableCell>
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
                          {!product.is_offer && (
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
                <Input 
                  id="name" 
                  placeholder="اسم المنتج" 
                  value={newProduct.name || ""}
                  onChange={handleInputChange}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="barcode_type">نوع الباركود</Label>
                <Select 
                  onValueChange={(value) => handleSelectChange(value, "barcode_type")}
                  value={newProduct.barcode_type}
                >
                  <SelectTrigger id="barcode_type">
                    <SelectValue placeholder="اختر نوع الباركود" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">عادي</SelectItem>
                    <SelectItem value="scale">ميزان (يبدأ برقم 2)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="barcode">الباركود</Label>
                <Input 
                  id="barcode" 
                  placeholder={newProduct.barcode_type === "scale" ? "يجب أن يبدأ برقم 2" : "الباركود"} 
                  value={newProduct.barcode || ""}
                  onChange={handleInputChange}
                />
                {newProduct.barcode_type === "scale" && newProduct.barcode && !newProduct.barcode.startsWith("2") && (
                  <p className="text-xs text-destructive mt-1">باركود الميزان يجب أن يبدأ بالرقم 2</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="quantity">الكمية</Label>
                <Input 
                  id="quantity" 
                  type="number" 
                  placeholder="0" 
                  value={newProduct.quantity || ""}
                  onChange={handleInputChange}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="price">سعر البيع</Label>
                <Input 
                  id="price" 
                  type="number" 
                  placeholder="0.00" 
                  value={newProduct.price || ""}
                  onChange={handleInputChange}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="purchase_price">سعر الشراء</Label>
                <Input 
                  id="purchase_price" 
                  type="number" 
                  placeholder="0.00" 
                  value={newProduct.purchase_price || ""}
                  onChange={handleInputChange}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="bulk_enabled" 
                  checked={newProduct.bulk_enabled}
                  onCheckedChange={(checked) => handleCheckboxChange(!!checked, "bulk_enabled")} 
                />
                <Label htmlFor="bulk_enabled" className="mr-2">تمكين البيع بالجملة</Label>
              </div>
            </div>
            
            {newProduct.bulk_enabled && (
              <div className="grid grid-cols-3 gap-4 pt-2 border-t">
                <div className="space-y-2">
                  <Label htmlFor="bulk_quantity">كمية العبوة</Label>
                  <Input 
                    id="bulk_quantity" 
                    type="number" 
                    placeholder="عدد الوحدات" 
                    value={newProduct.bulk_quantity || ""}
                    onChange={handleInputChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bulk_price">سعر الجملة</Label>
                  <Input 
                    id="bulk_price" 
                    type="number" 
                    placeholder="0.00" 
                    value={newProduct.bulk_price || ""}
                    onChange={handleInputChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bulk_barcode">باركود الجملة</Label>
                  <Input 
                    id="bulk_barcode" 
                    placeholder="باركود عبوة الجملة" 
                    value={newProduct.bulk_barcode || ""}
                    onChange={handleInputChange}
                  />
                </div>
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="category">الفئة</Label>
              <Input 
                id="category_id" 
                placeholder="الفئة" 
                value={newProduct.category_id || ""}
                onChange={handleInputChange}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="image">صورة المنتج</Label>
              <Input id="image" type="file" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" onClick={handleSaveProduct}>حفظ المنتج</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
