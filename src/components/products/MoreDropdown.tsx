
import React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Edit, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Product } from "@/types";
import { toast } from "sonner";
import { deleteProduct } from "@/services/supabase/productService";

interface MoreDropdownProps {
  product: Product;
}

export const MoreDropdown: React.FC<MoreDropdownProps> = ({ product }) => {
  const handleDelete = async () => {
    try {
      await deleteProduct(product.id);
      toast.success("تم حذف المنتج بنجاح");
    } catch (error) {
      console.error("Error deleting product:", error);
      toast.error("حدث خطأ أثناء حذف المنتج");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 w-8 p-0">
          <span className="sr-only">فتح القائمة</span>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>الإجراءات</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to={`/edit-product/${product.id}`} className="flex items-center">
            <Edit className="mr-2 h-4 w-4" />
            تعديل
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleDelete} className="flex items-center text-destructive">
          <Trash2 className="mr-2 h-4 w-4" />
          حذف
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
