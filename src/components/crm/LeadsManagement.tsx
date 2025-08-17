import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";
import { fetchLeads, addLead, updateLeadStatus } from "@/services/supabase/crmService";
import { 
  Plus, 
  Phone, 
  Mail, 
  User, 
  Calendar,
  TrendingUp,
  Target,
  Clock,
  Star,
  CheckCircle,
  XCircle
} from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

interface Lead {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  source: string;
  status: 'new' | 'contacted' | 'qualified' | 'proposal' | 'closed_won' | 'closed_lost';
  score: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export function LeadsManagement() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leads"],
    queryFn: fetchLeads,
  });

  const form = useForm({
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      source: "",
      notes: "",
    },
  });

  const addMutation = useMutation({
    mutationFn: addLead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      setIsDialogOpen(false);
      form.reset();
      toast({
        title: "تم الحفظ",
        description: "تم إضافة العميل المحتمل بنجاح",
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => 
      updateLeadStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast({
        title: "تم التحديث",
        description: "تم تحديث حالة العميل المحتمل بنجاح",
      });
    },
  });

  const onSubmit = async (data: any) => {
    await addMutation.mutateAsync(data);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new':
        return 'default';
      case 'contacted':
        return 'secondary';
      case 'qualified':
        return 'default';
      case 'proposal':
        return 'default';
      case 'closed_won':
        return 'default';
      case 'closed_lost':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'new':
        return 'جديد';
      case 'contacted':
        return 'تم التواصل';
      case 'qualified':
        return 'مؤهل';
      case 'proposal':
        return 'عرض سعر';
      case 'closed_won':
        return 'تم الإغلاق - نجح';
      case 'closed_lost':
        return 'تم الإغلاق - فشل';
      default:
        return status;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  // إحصائيات سريعة
  const totalLeads = leads.length;
  const qualifiedLeads = leads.filter((lead: Lead) => lead.status === 'qualified').length;
  const closedWonLeads = leads.filter((lead: Lead) => lead.status === 'closed_won').length;
  const conversionRate = totalLeads > 0 ? ((closedWonLeads / totalLeads) * 100).toFixed(1) : 0;

  if (isLoading) {
    return <div>جاري التحميل...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">إدارة العملاء المحتملين</h2>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 ml-2" />
              عميل محتمل جديد
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>إضافة عميل محتمل</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الاسم</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="اسم العميل المحتمل" required />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>البريد الإلكتروني</FormLabel>
                      <FormControl>
                        <Input {...field} type="email" placeholder="example@email.com" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>رقم الهاتف</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="01xxxxxxxxx" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="source"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>المصدر</FormLabel>
                      <Select onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="اختر المصدر" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="website">الموقع الإلكتروني</SelectItem>
                          <SelectItem value="social_media">وسائل التواصل</SelectItem>
                          <SelectItem value="referral">إحالة</SelectItem>
                          <SelectItem value="advertising">إعلانات</SelectItem>
                          <SelectItem value="other">أخرى</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ملاحظات</FormLabel>
                      <FormControl>
                        <Textarea {...field} placeholder="ملاحظات إضافية" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end space-x-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                  >
                    إلغاء
                  </Button>
                  <Button type="submit" disabled={addMutation.isPending}>
                    {addMutation.isPending ? "جاري الحفظ..." : "حفظ"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* إحصائيات سريعة */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي العملاء المحتملين</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalLeads}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">مؤهلين</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{qualifiedLeads}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">تم الإغلاق بنجاح</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{closedWonLeads}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">معدل التحويل</CardTitle>
            <Star className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{conversionRate}%</div>
          </CardContent>
        </Card>
      </div>

      {/* قائمة العملاء المحتملين */}
      <div className="grid gap-4">
        {leads.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center text-muted-foreground">
                لا يوجد عملاء محتملين بعد
              </div>
            </CardContent>
          </Card>
        ) : (
          leads.map((lead: Lead) => (
            <Card key={lead.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <User className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <CardTitle className="text-lg">{lead.name}</CardTitle>
                      <div className="flex items-center space-x-4 text-sm text-muted-foreground mt-1">
                        {lead.email && (
                          <div className="flex items-center space-x-1">
                            <Mail className="h-3 w-3" />
                            <span>{lead.email}</span>
                          </div>
                        )}
                        {lead.phone && (
                          <div className="flex items-center space-x-1">
                            <Phone className="h-3 w-3" />
                            <span>{lead.phone}</span>
                          </div>
                        )}
                        <div className="flex items-center space-x-1">
                          <Clock className="h-3 w-3" />
                          <span>
                            {format(new Date(lead.created_at), 'PPp', { locale: ar })}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant={getStatusColor(lead.status)}>
                      {getStatusLabel(lead.status)}
                    </Badge>
                    <div className={`font-bold ${getScoreColor(lead.score)}`}>
                      {lead.score}/100
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      المصدر: {lead.source}
                    </p>
                    {lead.notes && (
                      <p className="text-sm mt-2">{lead.notes}</p>
                    )}
                  </div>
                  <div className="flex space-x-2">
                    <Select
                      value={lead.status}
                      onValueChange={(value) => 
                        updateStatusMutation.mutate({ id: lead.id, status: value })
                      }
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">جديد</SelectItem>
                        <SelectItem value="contacted">تم التواصل</SelectItem>
                        <SelectItem value="qualified">مؤهل</SelectItem>
                        <SelectItem value="proposal">عرض سعر</SelectItem>
                        <SelectItem value="closed_won">تم الإغلاق - نجح</SelectItem>
                        <SelectItem value="closed_lost">تم الإغلاق - فشل</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}