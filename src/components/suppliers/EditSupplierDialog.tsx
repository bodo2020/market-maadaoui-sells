
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Supplier } from "@/types";
import SupplierForm from "./SupplierForm";

interface EditSupplierDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: Supplier;
}

export function EditSupplierDialog({ open, onOpenChange, supplier }: EditSupplierDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>تعديل بيانات المورد</DialogTitle>
        </DialogHeader>
        <SupplierForm supplier={supplier} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
