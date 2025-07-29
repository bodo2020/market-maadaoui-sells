
import MainLayout from "@/components/layout/MainLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Store, Users, PackageOpen, CreditCard, Truck, Receipt, FileText, Settings as SettingsIcon, Building2 } from "lucide-react";
import StoreSettings from "@/components/settings/StoreSettings";
import UsersManagement from "@/components/settings/UsersManagement";
import BranchSettings from "@/components/settings/BranchSettings";
import ExpenseSettings from "@/components/settings/ExpenseSettings";
import PaymentSettings from "@/components/settings/PaymentSettings";
import InvoiceSettings from "@/components/settings/InvoiceSettings";
import { useAuth } from "@/contexts/AuthContext";
import { UserRole } from "@/types";
import { useIsMobile } from "@/hooks/use-mobile";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export default function Settings() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState("store");
  const [sheetOpen, setSheetOpen] = useState(false);

  const tabs = [
    { id: "store", label: "المتجر", icon: <Store className="ml-2 h-4 w-4" />, component: <StoreSettings /> },
    { id: "users", label: "المستخدمين", icon: <Users className="ml-2 h-4 w-4" />, component: <UsersManagement /> },
    { id: "branches", label: "الفروع", icon: <Building2 className="ml-2 h-4 w-4" />, component: <BranchSettings /> },
    { id: "products", label: "المنتجات", icon: <PackageOpen className="ml-2 h-4 w-4" />, component: <div className="text-center py-12 text-muted-foreground">إعدادات المنتجات ستكون متاحة قريباً</div> },
    { id: "payment", label: "الدفع", icon: <CreditCard className="ml-2 h-4 w-4" />, component: <PaymentSettings /> },
    { id: "shipping", label: "الشحن", icon: <Truck className="ml-2 h-4 w-4" />, component: <div className="text-center py-12 text-muted-foreground">إعدادات الشحن ستكون متاحة قريباً</div> },
    { id: "expenses", label: "المصاريف", icon: <Receipt className="ml-2 h-4 w-4" />, component: <ExpenseSettings /> },
    { id: "invoices", label: "الفواتير", icon: <FileText className="ml-2 h-4 w-4" />, component: <InvoiceSettings /> },
  ];

  console.log("User role:", user?.role, "isAdmin:", isAdmin, "isSuperAdmin:", isSuperAdmin, "tabs count:", tabs.length);
  console.log("Available tabs:", tabs.map(tab => tab.label));

  // Mobile tabs sheet
  const MobileTabsSheet = () => (
    <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
      <SheetTrigger asChild>
        <button className="flex items-center gap-2 bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium">
          {tabs.find(tab => tab.id === activeTab)?.icon}
          {tabs.find(tab => tab.id === activeTab)?.label}
          <SettingsIcon className="h-4 w-4" />
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[70vh]">
        <div className="flex flex-col space-y-2 pt-6 h-full overflow-y-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setSheetOpen(false);
              }}
              className={`flex items-center p-3 rounded-md text-right ${
                activeTab === tab.id 
                  ? "bg-primary/10 text-primary font-medium" 
                  : "hover:bg-muted"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );

  return (
    <MainLayout>
      <div className="container py-4 md:py-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
          <h1 className="text-2xl md:text-3xl font-bold mb-4 md:mb-0">الإعدادات</h1>
          
          {isMobile && <MobileTabsSheet />}
        </div>

        {isMobile ? (
          <div className="mt-4">
            {tabs.find(tab => tab.id === activeTab)?.component}
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 md:grid-cols-8 mb-8">
              {tabs.map(tab => (
                <TabsTrigger key={tab.id} value={tab.id} className="flex items-center">
                  {tab.icon}
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
            
            {tabs.map(tab => (
              <TabsContent key={tab.id} value={tab.id}>
                {tab.component}
              </TabsContent>
            ))}
          </Tabs>
        )}
      </div>
    </MainLayout>
  );
}
