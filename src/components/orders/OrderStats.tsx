
import { Order } from "@/types";
import { Badge } from "@/components/ui/badge";

interface OrderStatsProps {
  orders: Order[];
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function OrderStats({ orders, activeTab, onTabChange }: OrderStatsProps) {
  const getOrdersCount = (status: string) => {
    return orders.filter(order => order.status === status).length;
  };

  return (
    <div className="grid grid-cols-5 mb-4">
      <button
        onClick={() => onTabChange("all")}
        className={`relative font-semibold p-2 ${activeTab === "all" ? "bg-primary text-white" : ""}`}
      >
        الجميع
        <Badge className="mr-2 bg-primary">{orders.length}</Badge>
      </button>
      <button
        onClick={() => onTabChange("waiting")}
        className={`relative font-semibold p-2 ${activeTab === "waiting" ? "bg-amber-500 text-white" : ""}`}
      >
        في الانتظار
        <Badge className="mr-2 bg-amber-500">{getOrdersCount('waiting')}</Badge>
      </button>
      <button
        onClick={() => onTabChange("ready")}
        className={`font-semibold p-2 ${activeTab === "ready" ? "bg-green-500 text-white" : ""}`}
      >
        جاهز
        <Badge className="mr-2 bg-green-500">{getOrdersCount('ready')}</Badge>
      </button>
      <button
        onClick={() => onTabChange("done")}
        className={`font-semibold p-2 ${activeTab === "done" ? "bg-gray-500 text-white" : ""}`}
      >
        مكتمل
        <Badge className="mr-2 bg-gray-500">{getOrdersCount('done')}</Badge>
      </button>
      <button
        onClick={() => onTabChange("cancelled")}
        className={`font-semibold p-2 ${activeTab === "cancelled" ? "bg-red-500 text-white" : ""}`}
      >
        ملغي
        <Badge className="mr-2 bg-red-500">{getOrdersCount('cancelled')}</Badge>
      </button>
    </div>
  );
}
