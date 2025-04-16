
import { useState } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SuppliersList from "@/components/suppliers/SuppliersList";
import CustomersList from "@/components/customers/CustomersList";
import { Briefcase, User } from "lucide-react";

export default function SuppliersCustomers() {
  const [activeTab, setActiveTab] = useState("suppliers");
  
  return (
    <MainLayout>
      <div className="container mx-auto p-4">
        <h1 className="text-2xl font-bold mb-6">إدارة الموردين والعملاء</h1>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2 mb-6">
            <TabsTrigger value="suppliers" className="flex items-center">
              <Briefcase className="mr-2 h-4 w-4" /> الموردين
            </TabsTrigger>
            <TabsTrigger value="customers" className="flex items-center">
              <User className="mr-2 h-4 w-4" /> العملاء
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="suppliers">
            <SuppliersList />
          </TabsContent>
          
          <TabsContent value="customers">
            <CustomersList />
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
