
import { MoreVertical, Archive, XCircle, Package, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

interface OrderActionsMenuProps {
  onArchive: () => void;
  onCancel: () => void;
  onProcess: () => void;
  onComplete: () => void;
}

export function OrderActionsMenu({ onArchive, onCancel, onProcess, onComplete }: OrderActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 p-0">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onArchive}>
          <Archive className="ml-2 h-4 w-4" />
          <span>أرشفة</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onCancel} className="text-destructive">
          <XCircle className="ml-2 h-4 w-4" />
          <span>إلغاء</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onProcess}>
          <Package className="ml-2 h-4 w-4" />
          <span>تجهيز</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onComplete}>
          <Check className="ml-2 h-4 w-4" />
          <span>اكتمل</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
