
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";

interface DeleteSupplierDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplierName: string;
  onConfirm: () => void;
  disabled?: boolean;
}

export function DeleteSupplierDialog({
  open,
  onOpenChange,
  supplierName,
  onConfirm,
  disabled
}: DeleteSupplierDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>هل أنت متأكد من حذف هذا المورد؟</AlertDialogTitle>
          <AlertDialogDescription>
            أنت على وشك حذف المورد "{supplierName}". لا يمكن التراجع عن هذا الإجراء.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-row-reverse justify-start gap-2">
          <AlertDialogAction 
            onClick={onConfirm}
            disabled={disabled}
            className="bg-red-500 hover:bg-red-600"
          >
            {disabled ? "جاري الحذف..." : "حذف"}
          </AlertDialogAction>
          <AlertDialogCancel>إلغاء</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
