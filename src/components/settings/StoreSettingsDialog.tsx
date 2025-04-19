
import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function StoreSettingsDialog({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إعدادات المتجر</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {/* Settings content would go here */}
          <p>محتوى إعدادات المتجر</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
