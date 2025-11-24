import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  fetchBranchNeighborhoods, 
  removeBranchNeighborhood 
} from "@/services/supabase/deliveryService";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SelectNeighborhoodsDialog } from "./SelectNeighborhoodsDialog";
import { EditNeighborhoodPricingDialog } from "./EditNeighborhoodPricingDialog";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Props {
  branchId: string;
}

export function BranchNeighborhoodManager({ branchId }: Props) {
  const [selectDialogOpen, setSelectDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<any>(null);
  const queryClient = useQueryClient();

  const { data: branchNeighborhoods = [], isLoading } = useQuery({
    queryKey: ["branch-neighborhoods", branchId],
    queryFn: () => fetchBranchNeighborhoods(branchId),
    enabled: !!branchId,
  });

  const deleteMutation = useMutation({
    mutationFn: () => removeBranchNeighborhood(branchId, selectedNeighborhood?.neighborhood_id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branch-neighborhoods", branchId] });
      toast.success("تم حذف الحي بنجاح");
      setDeleteDialogOpen(false);
      setSelectedNeighborhood(null);
    },
    onError: (error) => {
      console.error("Error deleting neighborhood:", error);
      toast.error("حدث خطأ أثناء حذف الحي");
    },
  });

  const handleEdit = (item: any) => {
    setSelectedNeighborhood(item);
    setEditDialogOpen(true);
  };

  const handleDelete = (item: any) => {
    setSelectedNeighborhood(item);
    setDeleteDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>الأحياء المرتبطة بالفرع</CardTitle>
          <Button onClick={() => setSelectDialogOpen(true)} className="gap-2">
            <Plus size={16} />
            إضافة أحياء
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p>جاري التحميل...</p>
          ) : branchNeighborhoods.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              لا توجد أحياء مرتبطة بهذا الفرع بعد
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الحي</TableHead>
                  <TableHead>المنطقة</TableHead>
                  <TableHead>المدينة</TableHead>
                  <TableHead>المحافظة</TableHead>
                  <TableHead>السعر (ج.م)</TableHead>
                  <TableHead>الوقت المتوقع</TableHead>
                  <TableHead>الأولوية</TableHead>
                  <TableHead>إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {branchNeighborhoods.map((item: any) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      {item.neighborhoods?.name}
                      {item.is_primary && (
                        <Badge variant="secondary" className="mr-2">رئيسي</Badge>
                      )}
                    </TableCell>
                    <TableCell>{item.neighborhoods?.areas?.name}</TableCell>
                    <TableCell>{item.neighborhoods?.areas?.cities?.name}</TableCell>
                    <TableCell>{item.neighborhoods?.areas?.cities?.governorates?.name}</TableCell>
                    <TableCell>{item.price || "-"}</TableCell>
                    <TableCell>{item.estimated_time || "-"}</TableCell>
                    <TableCell>{item.priority || 1}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(item)}
                        >
                          <Pencil size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(item)}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <SelectNeighborhoodsDialog
        branchId={branchId}
        open={selectDialogOpen}
        onOpenChange={setSelectDialogOpen}
      />

      {selectedNeighborhood && (
        <EditNeighborhoodPricingDialog
          branchId={branchId}
          neighborhood={selectedNeighborhood}
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
        />
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>هل أنت متأكد؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف ربط الحي "{selectedNeighborhood?.neighborhoods?.name}" من هذا الفرع.
              هذا الإجراء لا يمكن التراجع عنه.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
