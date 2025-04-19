
import MainLayout from "@/components/layout/MainLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Store, Users, PackageOpen, CreditCard, Truck, Receipt, FileText } from "lucide-react";
import StoreSettings from "@/components/settings/StoreSettings";
import UsersManagement from "@/components/settings/UsersManagement";
import ExpenseSettings from "@/components/settings/ExpenseSettings";
import PaymentSettings from "@/components/settings/PaymentSettings";
import InvoiceSettings from "@/components/settings/InvoiceSettings";
import { useAuth } from "@/contexts/AuthContext";
import { UserRole } from "@/types";

export default function Settings() {
  const { user } = useAuth();
  const isAdmin = user?.role === UserRole.ADMIN;

  return (
    <MainLayout>
      <div className="container py-6">
        <h1 className="text-3xl font-bold mb-6">الإعدادات</h1>

        <Tabs defaultValue="store" className="w-full">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-7 mb-8">
            <TabsTrigger value="store" className="flex items-center">
              <Store className="ml-2 h-4 w-4" />
              المتجر
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="users" className="flex items-center">
                <Users className="ml-2 h-4 w-4" />
                المستخدمين
              </TabsTrigger>
            )}
            <TabsTrigger value="products" className="flex items-center">
              <PackageOpen className="ml-2 h-4 w-4" />
              المنتجات
            </TabsTrigger>
            <TabsTrigger value="payment" className="flex items-center">
              <CreditCard className="ml-2 h-4 w-4" />
              الدفع
            </TabsTrigger>
            <TabsTrigger value="shipping" className="flex items-center">
              <Truck className="ml-2 h-4 w-4" />
              الشحن
            </TabsTrigger>
            <TabsTrigger value="expenses" className="flex items-center">
              <Receipt className="ml-2 h-4 w-4" />
              المصاريف
            </TabsTrigger>
            <TabsTrigger value="invoices" className="flex items-center">
              <FileText className="ml-2 h-4 w-4" />
              الفواتير
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="store">
            <StoreSettings />
          </TabsContent>
          
          {isAdmin && (
            <TabsContent value="users">
              <UsersManagement />
            </TabsContent>
          )}
          
          <TabsContent value="products">
            <div className="text-center py-12 text-muted-foreground">
              إعدادات المنتجات ستكون متاحة قريباً
            </div>
          </TabsContent>
          
          <TabsContent value="payment">
            <PaymentSettings />
          </TabsContent>
          
          <TabsContent value="shipping">
            <div className="text-center py-12 text-muted-foreground">
              إعدادات الشحن ستكون متاحة قريباً
            </div>
          </TabsContent>
          
          <TabsContent value="expenses">
            <ExpenseSettings />
          </TabsContent>
          
          <TabsContent value="invoices">
            <InvoiceSettings />
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
