
import { Product, Category } from "@/types";
import { MoreDropdown } from "@/components/products/MoreDropdown";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface InventoryTableProps {
  products: Product[];
  loading: boolean;
  categories: Category[];
  formatDate: (dateString: string | null | undefined) => string;
}

const InventoryTable = ({ products, loading, categories, formatDate }: InventoryTableProps) => {
  return (
    <div className="rounded-md border">
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
              <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                لا توجد منتجات مطابقة للبحث
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
    </div>
  );
};

export default InventoryTable;
