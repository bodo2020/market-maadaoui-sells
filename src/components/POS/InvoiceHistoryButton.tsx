
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Receipt } from "lucide-react";
import SaleHistoryDialog from "./SaleHistoryDialog";

interface InvoiceHistoryButtonProps {
  storeInfo: any;
}

export default function InvoiceHistoryButton({ storeInfo }: InvoiceHistoryButtonProps) {
  const [showHistory, setShowHistory] = useState(false);
  
  return (
    <>
      <Button 
        variant="outline"
        onClick={() => setShowHistory(true)}
        className="w-full"
      >
        <Receipt className="ml-2 h-4 w-4" />
        سجل الفواتير
      </Button>
      
      <SaleHistoryDialog 
        open={showHistory}
        onOpenChange={setShowHistory}
        storeInfo={storeInfo}
      />
    </>
  );
}
