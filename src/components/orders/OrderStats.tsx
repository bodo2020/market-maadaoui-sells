
import { Order } from "@/types";
import { Badge } from "@/components/ui/badge";

interface OrderStatsProps {
  orders: Order[];
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function OrderStats({ orders, activeTab, onTabChange }: OrderStatsProps) {
  const getPendingOrdersCount = () => {
    return orders.filter(order => order.status === 'pending' || order.status === 'processing').length;
  };

  const getUnpaidOrdersCount = () => {
    return orders.filter(order => order.payment_status === 'pending').length;
  };

  return (
    <div className="grid grid-cols-7 mb-4">
      <button
        onClick={() => onTabChange("all")}
        className={`relative font-semibold p-2 ${activeTab === "all" ? "bg-primary text-white" : ""}`}
      >
        الجميع
        <Badge className="mr-2 bg-primary">{orders.length}</Badge>
      </button>
      <button
        onClick={() => onTabChange("pending")}
        className={`relative font-semibold p-2 ${activeTab === "pending" ? "bg-primary text-white" : ""}`}
      >
        بإنتظار التجهيز
        <Badge className="mr-2 bg-primary">{getPendingOrdersCount()}</Badge>
      </button>
      <button
        onClick={() => onTabChange("processing")}
        className={`font-semibold p-2 ${activeTab === "processing" ? "bg-primary text-white" : ""}`}
      >
        قيد المعالجة
      </button>
      <button
        onClick={() => onTabChange("shipped")}
        className={`font-semibold p-2 ${activeTab === "shipped" ? "bg-primary text-white" : ""}`}
      >
        تم الشحن
      </button>
      <button
        onClick={() => onTabChange("delivered")}
        className={`font-semibold p-2 ${activeTab === "delivered" ? "bg-primary text-white" : ""}`}
      >
        تم التسليم
      </button>
      <button
        onClick={() => onTabChange("cancelled")}
        className={`font-semibold p-2 ${activeTab === "cancelled" ? "bg-primary text-white" : ""}`}
      >
        ملغي
      </button>
      <button
        onClick={() => onTabChange("unpaid")}
        className={`relative font-semibold p-2 ${activeTab === "unpaid" ? "bg-primary text-white" : ""}`}
      >
        غير مدفوع
        <Badge className="mr-2 bg-primary">{getUnpaidOrdersCount()}</Badge>
      </button>
    </div>
  );
}
