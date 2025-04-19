
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import MainLayout from "@/components/layout/MainLayout";
import { Product, Category, Subcategory, Subsubcategory, MainCategory, Company } from "@/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { MoreDropdown } from "@/components/products/MoreDropdown";
import { fetchCategories } from "@/services/supabase/categoryService";

export default function InventoryManagement() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [subsubcategories, setSubsubcategories] = useState<Subsubcategory[]>([]);
  const [mainCategories, setMainCategories] = useState<MainCategory[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [selectedSubsubcategory, setSelectedSubsubcategory] = useState<string | null>(null);
  const [selectedMainCategory, setSelectedMainCategory] = useState<string | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [sortField, setSortField] = useState<string>("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    fetchProducts();
    fetchCategoriesData();
    fetchSubcategories();
    fetchSubsubcategories();
    fetchMainCategories();
    fetchCompanies();
  }, [searchQuery, selectedCategory, selectedSubcategory, selectedSubsubcategory, selectedMainCategory, selectedCompany, sortField, sortOrder]);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("products")
        .select("*")
        .like("name", `%${searchQuery}%`);

      if (selectedCategory) {
        query = query.eq("category_id", selectedCategory);
      }

      if (selectedSubcategory) {
        query = query.eq("subcategory_id", selectedSubcategory);
      }

      if (selectedSubsubcategory) {
        query = query.eq("subsubcategory_id", selectedSubsubcategory);
      }

      if (selectedMainCategory) {
        query = query.eq("main_category_id", selectedMainCategory);
      }

      if (selectedCompany) {
        query = query.eq("company_id", selectedCompany);
      }

      query = query.order(sortField, { ascending: sortOrder === "asc" });

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching products:", error);
        toast.error("فشل في جلب المنتجات.");
      }

      setProducts(data || []);
    } catch (error) {
      console.error("Unexpected error fetching products:", error);
      toast.error("حدث خطأ غير متوقع أثناء جلب المنتجات.");
    } finally {
      setLoading(false);
    }
  };

  const fetchCategoriesData = async () => {
    try {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .order("name");

      if (error) {
        console.error("Error fetching categories:", error);
        toast.error("فشل في جلب الفئات.");
      } else {
        setCategories(data || []);
      }
    } catch (error) {
      console.error("Unexpected error fetching categories:", error);
      toast.error("حدث خطأ غير متوقع أثناء جلب الفئات.");
    }
  };

  const fetchSubcategories = async () => {
    try {
      const { data, error } = await supabase
        .from("subcategories")
        .select("*")
        .order("name");

      if (error) {
        console.error("Error fetching subcategories:", error);
        toast.error("فشل في جلب الفئات الفرعية.");
      } else {
        setSubcategories(data || []);
      }
    } catch (error) {
      console.error("Unexpected error fetching subcategories:", error);
      toast.error("حدث خطأ غير متوقع أثناء جلب الفئات الفرعية.");
    }
  };

  const fetchSubsubcategories = async () => {
    try {
      const { data, error } = await supabase
        .from("subsubcategories")
        .select("*")
        .order("name");

      if (error) {
        console.error("Error fetching subsubcategories:", error);
        toast.error("فشل في جلب الفئات الفرعية الفرعية.");
      } else {
        setSubsubcategories(data || []);
      }
    } catch (error) {
      console.error("Unexpected error fetching subsubcategories:", error);
      toast.error("حدث خطأ غير متوقع أثناء جلب الفئات الفرعية الفرعية.");
    }
  };

  const fetchMainCategories = async () => {
    try {
      const { data, error } = await supabase
        .from("main_categories")
        .select("*")
        .order("name");

      if (error) {
        console.error("Error fetching main categories:", error);
        toast.error("فشل في جلب الفئات الرئيسية.");
      } else {
        setMainCategories(data || []);
      }
    } catch (error) {
      console.error("Unexpected error fetching main categories:", error);
      toast.error("حدث خطأ غير متوقع أثناء جلب الفئات الرئيسية.");
    }
  };

  const fetchCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .order("name");

      if (error) {
        console.error("Error fetching companies:", error);
        toast.error("فشل في جلب الشركات.");
      } else {
        setCompanies(data || []);
      }
    } catch (error) {
      console.error("Unexpected error fetching companies:", error);
      toast.error("حدث خطأ غير متوقع أثناء جلب الشركات.");
    }
  };

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedCategory(null);
    setSelectedSubcategory(null);
    setSelectedSubsubcategory(null);
    setSelectedMainCategory(null);
    setSelectedCompany(null);
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "N/A";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString();
    } catch (error) {
      return "Invalid Date";
    }
  };

  return (
    <MainLayout>
      <div className="container mx-auto p-6 dir-rtl">
        <h1 className="text-2xl font-bold mb-4">إدارة المخزون</h1>

        <Card>
          <CardHeader>
            <CardTitle>قائمة المنتجات</CardTitle>
            <CardDescription>عرض وتعديل المنتجات في المخزون</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="relative">
                <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="ابحث عن منتج..."
                  className="pl-10"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="flex gap-2">
                <Select onValueChange={(value) => setSelectedCategory(value === "all" ? null : value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="اختر فئة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select onValueChange={(value) => setSelectedSubcategory(value === "all" ? null : value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="اختر فئة فرعية" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    {subcategories.map((subcategory) => (
                      <SelectItem key={subcategory.id} value={subcategory.id}>
                        {subcategory.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select onValueChange={(value) => setSelectedSubsubcategory(value === "all" ? null : value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="اختر فئة فرعية فرعية" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    {subsubcategories.map((subsubcategory) => (
                      <SelectItem key={subsubcategory.id} value={subsubcategory.id}>
                        {subsubcategory.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select onValueChange={(value) => setSelectedMainCategory(value === "all" ? null : value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="اختر فئة رئيسية" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    {mainCategories.map((mainCategory) => (
                      <SelectItem key={mainCategory.id} value={mainCategory.id}>
                        {mainCategory.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select onValueChange={(value) => setSelectedCompany(value === "all" ? null : value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="اختر شركة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    {companies.map((company) => (
                      <SelectItem key={company.id} value={company.id}>
                        {company.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-between items-center mb-4">
              <Button variant="outline" size="sm" onClick={clearFilters}>
                إعادة تعيين الفلاتر
              </Button>

              <div className="flex items-center space-x-2 space-x-reverse">
                <Label htmlFor="sort">ترتيب حسب</Label>
                <Select value={sortField} onValueChange={setSortField}>
                  <SelectTrigger id="sort">
                    <SelectValue placeholder="اسم المنتج" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">اسم المنتج</SelectItem>
                    <SelectItem value="price">السعر</SelectItem>
                    <SelectItem value="quantity">الكمية</SelectItem>
                    <SelectItem value="created_at">تاريخ الإنشاء</SelectItem>
                    <SelectItem value="updated_at">تاريخ التعديل</SelectItem>
                  </SelectContent>
                </Select>

                <Select 
                  value={sortOrder} 
                  onValueChange={(value: "asc" | "desc") => setSortOrder(value)}
                >
                  <SelectTrigger id="order">
                    <SelectValue placeholder="تصاعدي" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asc">تصاعدي</SelectItem>
                    <SelectItem value="desc">تنازلي</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <ScrollArea>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>اسم المنتج</TableHead>
                    <TableHead>السعر</TableHead>
                    <TableHead>الكمية</TableHead>
                    <TableHead>الفئة</TableHead>
                    <TableHead>تاريخ الإنشاء</TableHead>
                    <TableHead>تاريخ التعديل</TableHead>
                    <TableHead className="text-center">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center">
                        تحميل...
                      </TableCell>
                    </TableRow>
                  ) : products.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center">
                        لا توجد منتجات مسجلة.
                      </TableCell>
                    </TableRow>
                  ) : (
                    products.map((product) => (
                      <TableRow key={product.id}>
                        <TableCell className="font-medium">{product.name}</TableCell>
                        <TableCell>{product.price}</TableCell>
                        <TableCell>
                          {product.quantity !== null && product.quantity !== undefined
                            ? product.quantity
                            : "غير محدد"}
                        </TableCell>
                        <TableCell>
                          {categories.find((cat) => cat.id === product.category_id)?.name || "غير مصنف"}
                        </TableCell>
                        <TableCell>{formatDate(product.created_at)}</TableCell>
                        <TableCell>{formatDate(product.updated_at)}</TableCell>
                        <TableCell className="text-center">
                          <MoreDropdown product={product} />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
