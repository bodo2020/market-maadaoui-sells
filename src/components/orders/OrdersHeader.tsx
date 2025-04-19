
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, RefreshCw } from "lucide-react";
import { OrderFilters } from "@/hooks/orders/useOrdersData";

interface OrdersHeaderProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onSearchChange: (value: string) => void;
  searchQuery: string;
  onRefresh: () => void;
  isLoading: boolean;
}

export function OrdersHeader({
  activeTab,
  onTabChange,
  onSearchChange,
  searchQuery,
  onRefresh,
  isLoading
}: OrdersHeaderProps) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">إدارة الطلبات</h1>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={onRefresh}
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          تحديث
        </Button>
      </div>
      
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={activeTab}
          onValueChange={onTabChange}
          className="w-full sm:w-auto"
        >
          <TabsList className="w-full sm:w-auto grid grid-cols-3 sm:grid-cols-6">
            <TabsTrigger value="all">الكل</TabsTrigger>
            <TabsTrigger value="pending">بانتظار التجهيز</TabsTrigger>
            <TabsTrigger value="processing">قيد المعالجة</TabsTrigger>
            <TabsTrigger value="ready">جاهز للتوصيل</TabsTrigger>
            <TabsTrigger value="shipped">تم الشحن</TabsTrigger>
            <TabsTrigger value="delivered">تم التسليم</TabsTrigger>
          </TabsList>
        </Tabs>
        
        <div className="relative w-full max-w-xs">
          <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="البحث في الطلبات..."
            className="pl-3 pr-10"
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
