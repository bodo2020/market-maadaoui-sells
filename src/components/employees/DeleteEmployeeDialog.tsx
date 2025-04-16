
import React from 'react';
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type DeleteEmployeeDialogProps = {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  handleDelete: () => void;
  isDeleting: boolean;
};

export function DeleteEmployeeDialog({
  isOpen,
  setIsOpen,
  handleDelete,
  isDeleting,
}: DeleteEmployeeDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>حذف الموظف</DialogTitle>
          <DialogDescription>
            هل أنت متأكد من رغبتك في حذف هذا الموظف؟ سيتم حذف جميع بيانات الورديات المرتبطة به. هذا الإجراء لا يمكن التراجع عنه.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => setIsOpen(false)}
          >
            إلغاء
          </Button>
          <Button 
            variant="destructive" 
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <>
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                جارِ الحذف...
              </>
            ) : "حذف"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
