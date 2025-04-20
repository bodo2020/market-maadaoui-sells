
import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  MoreVertical,
  Edit,
  Trash2,
  ChevronsUpDown,
} from "lucide-react";
import { Supplier } from "@/types";
import { EditSupplierDialog } from "./EditSupplierDialog";
import { DeleteSupplierDialog } from "./DeleteSupplierDialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteSupplier } from "@/services/supabase/supplierService";
import { toast } from "sonner";

interface SuppliersListProps {
  suppliers: Supplier[];
}

export function SuppliersList({ suppliers }: SuppliersListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [openEditDialog, setOpenEditDialog] = useState(false);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(
    null
  );
  const queryClient = useQueryClient();

  const deleteSupplierMutation = useMutation({
    mutationFn: deleteSupplier,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success("تم حذف المورد بنجاح");
    },
    onError: (error) => {
      toast.error("حدث خطأ أثناء حذف المورد");
      console.error("Error deleting supplier:", error);
    }
  });

  const filteredSuppliers = suppliers.filter((supplier) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      supplier.name.toLowerCase().includes(searchLower) ||
      (supplier.contact_person &&
        supplier.contact_person.toLowerCase().includes(searchLower)) ||
      (supplier.phone && supplier.phone.toLowerCase().includes(searchLower)) ||
      (supplier.email && supplier.email.toLowerCase().includes(searchLower))
    );
  });

  const handleEdit = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setOpenEditDialog(true);
  };

  const handleDelete = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setOpenDeleteDialog(true);
  };

  const confirmDelete = async (id: string) => {
    try {
      await deleteSupplierMutation.mutateAsync(id);
    } catch (error) {
      console.error("Error confirming delete:", error);
    } finally {
      setOpenDeleteDialog(false);
    }
  };

  return (
    <>
      <div className="relative w-full max-w-md">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="البحث عن مورد..."
          className="pl-8"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="mt-4 rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">اسم المورد</TableHead>
              <TableHead>الشخص المسؤول</TableHead>
              <TableHead>رقم الهاتف</TableHead>
              <TableHead>البريد الإلكتروني</TableHead>
              <TableHead className="text-center">الإجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSuppliers.map((supplier) => (
              <TableRow key={supplier.id}>
                <TableCell className="font-medium">{supplier.name}</TableCell>
                <TableCell>
                  {supplier.contact_person || "غير محدد"}
                </TableCell>
                <TableCell>{supplier.phone || "غير محدد"}</TableCell>
                <TableCell>{supplier.email || "غير محدد"}</TableCell>
                <TableCell className="text-center">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <span className="sr-only">Open menu</span>
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEdit(supplier)}>
                        <Edit className="mr-2 h-4 w-4" /> <span>تعديل</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleDelete(supplier)}
                        disabled={deleteSupplierMutation.isLoading}
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> <span>حذف</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {selectedSupplier && (
        <EditSupplierDialog
          open={openEditDialog}
          onOpenChange={setOpenEditDialog}
          supplier={selectedSupplier}
        />
      )}

      {selectedSupplier && (
        <DeleteSupplierDialog
          open={openDeleteDialog}
          onOpenChange={setOpenDeleteDialog}
          supplierName={selectedSupplier.name}
          onConfirm={() => confirmDelete(selectedSupplier.id)}
          disabled={deleteSupplierMutation.isLoading}
        />
      )}
    </>
  );
}
