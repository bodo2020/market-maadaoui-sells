
import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Supplier } from "@/types";
import { fetchSuppliers, deleteSupplier, fetchSupplierTransactions } from "@/services/supabase/supplierService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Plus, Edit, Trash2, Phone, Mail, Building, User, CreditCard } from "lucide-react";
import SupplierForm from "./SupplierForm";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export default function SuppliersList() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [expandedSuppliers, setExpandedSuppliers] = useState<Record<string, boolean>>({});
  
  const queryClient = useQueryClient();
  
  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ["suppliers"],
    queryFn: fetchSuppliers
  });
  
  const deleteMutation = useMutation({
    mutationFn: deleteSupplier,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    }
  });
  
  const handleEditClick = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setIsFormOpen(true);
  };
  
  const handleAddClick = () => {
    setEditingSupplier(null);
    setIsFormOpen(true);
  };
  
  const handleDeleteClick = async (id: string) => {
    if (confirm("هل أنت متأكد من رغبتك في حذف هذا المورد؟")) {
      await deleteMutation.mutateAsync(id);
    }
  };
  
  const filteredSuppliers = suppliers.filter(supplier => {
    const searchTermLower = searchTerm.toLowerCase();
    return (
      supplier.name.toLowerCase().includes(searchTermLower) ||
      (supplier.contact_person || "").toLowerCase().includes(searchTermLower) ||
      (supplier.phone || "").includes(searchTerm) ||
      (supplier.email || "").toLowerCase().includes(searchTermLower)
    );
  });

  // Function to toggle transaction details and fetch data if needed
  const toggleTransactionDetails = (supplierId: string) => {
    if (!expandedSuppliers[supplierId]) {
      // Only fetch transactions when expanding
      queryClient.prefetchQuery({
        queryKey: ["supplierTransactions", supplierId],
        queryFn: () => fetchSupplierTransactions(supplierId)
      });
    }
    
    setExpandedSuppliers(prev => ({
      ...prev,
      [supplierId]: !prev[supplierId]
    }));
  };
  
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-xl flex items-center justify-between">
          <span>الموردين</span>
          <Button onClick={handleAddClick} className="mr-2">
            <Plus className="mr-2 h-4 w-4" /> إضافة مورد
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
        ) : filteredSuppliers.length === 0 ? (
          <div className="text-center text-muted-foreground p-4">
            {searchTerm ? "لا توجد نتائج مطابقة للبحث" : "لا يوجد موردين، أضف موردين جدد"}
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>اسم الشركة</TableHead>
                  <TableHead>جهة الاتصال</TableHead>
                  <TableHead>الهاتف</TableHead>
                  <TableHead>البريد الإلكتروني</TableHead>
                  <TableHead>العنوان</TableHead>
                  <TableHead>الرصيد</TableHead>
                  <TableHead className="text-left">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSuppliers.map((supplier) => (
                  <React.Fragment key={supplier.id}>
                    <TableRow>
                      <TableCell className="font-medium">{supplier.name}</TableCell>
                      <TableCell>{supplier.contact_person || "—"}</TableCell>
                      <TableCell>
                        {supplier.phone ? (
                          <div className="flex items-center">
                            <Phone className="h-4 w-4 mr-1" />
                            {supplier.phone}
                          </div>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        {supplier.email ? (
                          <div className="flex items-center">
                            <Mail className="h-4 w-4 mr-1" />
                            {supplier.email}
                          </div>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        {supplier.address ? (
                          <div className="flex items-center">
                            <Building className="h-4 w-4 mr-1" />
                            {supplier.address}
                          </div>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        {supplier.balance !== undefined ? (
                          <div className="flex items-center">
                            <CreditCard className="h-4 w-4 mr-1" />
                            {supplier.balance > 0 ? (
                              <Badge variant="outline" className="bg-green-50 text-green-700 hover:bg-green-50">
                                لنا: {supplier.balance}
                              </Badge>
                            ) : supplier.balance < 0 ? (
                              <Badge variant="outline" className="bg-red-50 text-red-700 hover:bg-red-50">
                                علينا: {Math.abs(supplier.balance)}
                              </Badge>
                            ) : (
                              <Badge variant="outline">متوازن</Badge>
                            )}
                          </div>
                        ) : (
                          <Badge variant="outline">0</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEditClick(supplier)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
                            onClick={() => handleDeleteClick(supplier.id)}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={7} className="p-0">
                        <Accordion type="single" collapsible className="w-full">
                          <AccordionItem value={supplier.id}>
                            <AccordionTrigger 
                              className="py-2 px-4 text-sm"
                            >
                              عرض تفاصيل المعاملات المالية
                            </AccordionTrigger>
                            <AccordionContent>
                              <SupplierTransactions supplierId={supplier.id} />
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      </TableCell>
                    </TableRow>
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      
      <Sheet open={isFormOpen} onOpenChange={setIsFormOpen}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{editingSupplier ? "تعديل المورد" : "إضافة مورد جديد"}</SheetTitle>
          </SheetHeader>
          <div className="py-4">
            <SupplierForm 
              supplier={editingSupplier}
              onClose={() => setIsFormOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>
    </Card>
  );
}

// Separate component for supplier transactions
function SupplierTransactions({ supplierId }: { supplierId: string }) {
  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["supplierTransactions", supplierId],
    queryFn: () => fetchSupplierTransactions(supplierId)
  });
  
  if (isLoading) {
    return <div className="p-4 text-center">جاري تحميل المعاملات...</div>;
  }
  
  if (transactions.length === 0) {
    return <div className="p-4 text-center text-muted-foreground">لا توجد معاملات لهذا المورد</div>;
  }
  
  return (
    <div className="p-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>التاريخ</TableHead>
            <TableHead>الوصف</TableHead>
            <TableHead>المبلغ</TableHead>
            <TableHead>النوع</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.map(transaction => (
            <TableRow key={transaction.id}>
              <TableCell>{new Date(transaction.date).toLocaleDateString('ar-EG')}</TableCell>
              <TableCell>{transaction.description}</TableCell>
              <TableCell>{transaction.amount}</TableCell>
              <TableCell>
                {transaction.type === 'debt' ? 
                  <Badge variant="outline" className="bg-red-50 text-red-700">علينا</Badge> : 
                  <Badge variant="outline" className="bg-green-50 text-green-700">لنا</Badge>
                }
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
