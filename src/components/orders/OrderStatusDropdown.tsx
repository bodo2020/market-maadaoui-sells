import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface OrderStatusDropdownProps {
  orderId: string;
  currentStatus: string;
  onStatusUpdated: (newStatus: string) => void;
}

// Update the component to handle all possible status values
export function OrderStatusDropdown({ orderId, currentStatus, onStatusUpdated }: OrderStatusDropdownProps) {
  const [open, setOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<string>(currentStatus);
  
  // Make sure to include all possible statuses
  const statusOptions = [
    { value: "waiting", label: "في الانتظار" },
    { value: "ready", label: "جاهز" },
    { value: "shipped", label: "تم الشحن" },
    { value: "done", label: "مكتمل" },
    { value: "cancelled", label: "ملغي" },
    { value: "returned", label: "مرتجع" }
  ];

  const handleStatusChange = async (status: string) => {
    setNewStatus(status);
    onStatusUpdated(status);
    setOpen(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="w-[150px] justify-start">
          <ChevronsUpDown className="mr-2 h-4 w-4" />
          {statusOptions.find((option) => option.value === currentStatus)?.label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[150px]">
        {statusOptions.map((status) => (
          <DropdownMenuItem
            key={status.value}
            onClick={() => handleStatusChange(status.value)}
          >
            <Check
              className={cn(
                "mr-2 h-4 w-4",
                newStatus === status.value ? "opacity-100" : "opacity-0"
              )}
            />
            {status.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
