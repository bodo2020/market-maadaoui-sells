
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Customer, fetchCustomers, deleteCustomer } from "@/services/supabase/customerService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Plus, Edit, Trash2, Phone, Mail, Building } from "lucide-react";
import CustomerForm from "./CustomerForm";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CustomersList() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  
  const queryClient = useQueryClient();
  
  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: fetchCustomers
  });
  
  const deleteMutation = useMutation({
    mutationFn: deleteCustomer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    }
  });
  
  const handleEditClick = (customer: Customer) => {
    setEditingCustomer(customer);
    setIsFormOpen(true);
  };
  
  const handleAddClick = () => {
    setEditingCustomer(null);
    setIsFormOpen(true);
  };
  
  const handleDeleteClick = async (id: string) => {
    if (confirm("هل أنت متأكد من رغبتك في حذف هذا العميل؟")) {
      await deleteMutation.mutateAsync(id);
    }
  };
  
  const filteredCustomers = customers.filter(customer => {
    const searchTermLower = searchTerm.toLowerCase();
    return (
      customer.name.toLowerCase().includes(searchTermLower) ||
      (customer.phone || "").includes(searchTerm) ||
      (customer.email || "").toLowerCase().includes(searchTermLower)
    );
  });
  
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-xl flex items-center justify-between">
          <span>العملاء</span>
          <Button onClick={handleAddClick} className="mr-2">
            <Plus className="mr-2 h-4 w-4" /> إضافة عميل
          </Button>
        </CardTitle>
        <div className="flex w-full max-w-sm items-center space-x-2 mt-2">
          <Input
            type="search"
            placeholder="بحث..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full"
          />
          <Button variant="ghost">
            <Search />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center p-4">جاري التحميل...</div>
        ) : filteredCustomers.length === 0 ? (
          <div className="text-center text-muted-foreground p-4">
            {searchTerm ? "لا توجد نتائج مطابقة للبحث" : "لا يوجد عملاء، أضف عملاء جدد"}
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>اسم العميل</TableHead>
                  <TableHead>الهاتف</TableHead>
                  <TableHead>البريد الإلكتروني</TableHead>
                  <TableHead>العنوان</TableHead>
                  <TableHead className="text-left">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCustomers.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell className="font-medium">{customer.name}</TableCell>
                    <TableCell>
                      {customer.phone ? (
                        <div className="flex items-center">
                          <Phone className="h-4 w-4 mr-1" />
                          {customer.phone}
                        </div>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      {customer.email ? (
                        <div className="flex items-center">
                          <Mail className="h-4 w-4 mr-1" />
                          {customer.email}
                        </div>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      {customer.address ? (
                        <div className="flex items-center">
                          <Building className="h-4 w-4 mr-1" />
                          {customer.address}
                        </div>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex space-x-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditClick(customer)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => handleDeleteClick(customer.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      
      <Sheet open={isFormOpen} onOpenChange={setIsFormOpen}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{editingCustomer ? "تعديل العميل" : "إضافة عميل جديد"}</SheetTitle>
          </SheetHeader>
          <div className="py-4">
            <CustomerForm 
              customer={editingCustomer}
              onClose={() => setIsFormOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>
    </Card>
  );
}
