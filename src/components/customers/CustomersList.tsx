
import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Customer } from "@/types";
import { fetchCustomers, deleteCustomer } from "@/services/supabase/customerService";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Edit, Trash2, Phone, Mail, Building, CreditCard, Download } from "lucide-react";
import CustomerForm from "./CustomerForm";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { CustomerSearch } from "./CustomerSearch";

interface CustomersListProps {
  searchTerm?: string;
}

export default function CustomersList({ searchTerm: externalSearchTerm }: CustomersListProps = {}) {
  const [searchTerm, setSearchTerm] = useState("");
  const effectiveSearchTerm = externalSearchTerm || searchTerm;
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
  
  const handleExportClick = () => {
    // TODO: Implement export functionality
    console.log("Export customers");
  };
  
  const handleSearch = () => {
    console.log("Searching for:", searchTerm);
    // The filtering is already handled in the component with filteredCustomers
  };
  
  const filteredCustomers = customers.filter(customer => {
    if (!searchTerm) return true;
    
    const searchTermLower = searchTerm.toLowerCase();
    return (
      (customer.name || "").toLowerCase().includes(searchTermLower) ||
      (customer.phone || "").includes(searchTerm) ||
      (customer.email || "").toLowerCase().includes(searchTermLower)
    );
  });
  
  // Mock data for customer transactions (to be implemented with a real backend)
  const getCustomerTransactions = (customerId: string) => {
    return [
      { id: 1, date: "2023-04-20", amount: -100, type: "debt", description: "فاتورة شراء منتجات" },
      { id: 2, date: "2023-04-21", amount: 41, type: "credit", description: "دفعة جزئية" },
      { id: 3, date: "2023-04-25", amount: 59, type: "credit", description: "دفعة نهائية" }
    ];
  };
  
  const calculateCustomerBalance = (customerId: string) => {
    const transactions = getCustomerTransactions(customerId);
    return transactions.reduce((balance, transaction) => balance + transaction.amount, 0);
  };
  
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-xl flex items-center justify-between">
          <span>العملاء</span>
          <div className="flex space-x-2">
            <Button onClick={handleExportClick} variant="outline" className="mr-2">
              <Download className="mr-2 h-4 w-4" /> تصدير
            </Button>
            <Button onClick={handleAddClick} className="mr-2">
              <Plus className="mr-2 h-4 w-4" /> إضافة عميل
            </Button>
          </div>
        </CardTitle>
        <div className="w-full max-w-sm mt-2">
          <CustomerSearch 
            search={searchTerm} 
            setSearch={setSearchTerm} 
            onSearch={handleSearch}
          />
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
                  <TableHead>الرصيد</TableHead>
                  <TableHead className="text-left">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCustomers.map((customer) => {
                  const balance = calculateCustomerBalance(customer.id);
                  
                  return (
                    <React.Fragment key={customer.id}>
                      <TableRow>
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
                          {balance > 0 ? (
                            <Badge variant="outline" className="bg-green-50 text-green-700 hover:bg-green-50">
                              <CreditCard className="h-3 w-3 mr-1" /> لنا: {balance}
                            </Badge>
                          ) : balance < 0 ? (
                            <Badge variant="outline" className="bg-red-50 text-red-700 hover:bg-red-50">
                              <CreditCard className="h-3 w-3 mr-1" /> علينا: {Math.abs(balance)}
                            </Badge>
                          ) : (
                            <Badge variant="outline">متوازن</Badge>
                          )}
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
                      <TableRow>
                        <TableCell colSpan={6} className="p-0">
                          <Accordion type="single" collapsible className="w-full">
                            <AccordionItem value={customer.id}>
                              <AccordionTrigger className="py-2 px-4 text-sm">
                                عرض تفاصيل المعاملات المالية
                              </AccordionTrigger>
                              <AccordionContent>
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
                                      {getCustomerTransactions(customer.id).map(transaction => (
                                        <TableRow key={transaction.id}>
                                          <TableCell>{transaction.date}</TableCell>
                                          <TableCell>{transaction.description}</TableCell>
                                          <TableCell>{Math.abs(transaction.amount)}</TableCell>
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
                              </AccordionContent>
                            </AccordionItem>
                          </Accordion>
                        </TableCell>
                      </TableRow>
                    </React.Fragment>
                  );
                })}
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
