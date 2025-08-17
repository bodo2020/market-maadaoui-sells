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
import { fetchCustomerInteractions, addCustomerInteraction } from "@/services/supabase/crmService";
import { 
  Phone, 
  Mail, 
  MessageSquare, 
  Calendar, 
  User, 
  Plus,
  Clock,
  Star
} from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

interface Interaction {
  id: string;
  customer_id: string;
  type: 'call' | 'email' | 'meeting' | 'note';
  subject: string;
  description?: string;
  status: 'pending' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high';
  scheduled_at?: string;
  created_at: string;
  created_by: string;
  customer_name?: string;
}

export function CustomerInteractions() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: interactions = [], isLoading } = useQuery({
    queryKey: ["customer-interactions"],
    queryFn: fetchCustomerInteractions,
  });

  const form = useForm({
    defaultValues: {
      customer_id: "",
      type: "note",
      subject: "",
      description: "",
      priority: "medium",
      scheduled_at: "",
    },
  });

  const addMutation = useMutation({
    mutationFn: addCustomerInteraction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-interactions"] });
      setIsDialogOpen(false);
      form.reset();
      toast({
        title: "تم الحفظ",
        description: "تم إضافة التفاعل بنجاح",
      });
    },
  });

  const onSubmit = async (data: any) => {
    await addMutation.mutateAsync(data);
  };

  const getInteractionIcon = (type: string) => {
    switch (type) {
      case 'call':
        return <Phone className="h-4 w-4" />;
      case 'email':
        return <Mail className="h-4 w-4" />;
      case 'meeting':
        return <Calendar className="h-4 w-4" />;
      default:
        return <MessageSquare className="h-4 w-4" />;
    }
  };

  const getInteractionTypeLabel = (type: string) => {
    switch (type) {
      case 'call':
        return 'مكالمة';
      case 'email':
        return 'بريد إلكتروني';
      case 'meeting':
        return 'اجتماع';
      default:
        return 'ملاحظة';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'destructive';
      case 'medium':
        return 'default';
      default:
        return 'secondary';
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'عالية';
      case 'medium':
        return 'متوسطة';
      default:
        return 'منخفضة';
    }
  };

  if (isLoading) {
    return <div>جاري التحميل...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">تفاعلات العملاء</h2>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 ml-2" />
              إضافة تفاعل
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>إضافة تفاعل جديد</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="customer_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>العميل</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="معرف العميل" required />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>نوع التفاعل</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="اختر نوع التفاعل" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="call">مكالمة</SelectItem>
                          <SelectItem value="email">بريد إلكتروني</SelectItem>
                          <SelectItem value="meeting">اجتماع</SelectItem>
                          <SelectItem value="note">ملاحظة</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="subject"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الموضوع</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="موضوع التفاعل" required />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الوصف</FormLabel>
                      <FormControl>
                        <Textarea {...field} placeholder="تفاصيل التفاعل" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الأولوية</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="اختر الأولوية" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="low">منخفضة</SelectItem>
                          <SelectItem value="medium">متوسطة</SelectItem>
                          <SelectItem value="high">عالية</SelectItem>
                        </SelectContent>
                      </Select>
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

      <div className="grid gap-4">
        {interactions.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center text-muted-foreground">
                لا توجد تفاعلات بعد
              </div>
            </CardContent>
          </Card>
        ) : (
          interactions.map((interaction: any) => (
            <Card key={interaction.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-2">
                    {getInteractionIcon(interaction.type)}
                    <div>
                      <CardTitle className="text-lg">{interaction.subject}</CardTitle>
                      <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                        <User className="h-3 w-3" />
                        <span>{interaction.customer_name || 'عميل غير محدد'}</span>
                        <Clock className="h-3 w-3 mr-2" />
                        <span>
                          {format(new Date(interaction.created_at), 'PPp', { locale: ar })}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant={getPriorityColor(interaction.priority)}>
                      <Star className="h-3 w-3 ml-1" />
                      {getPriorityLabel(interaction.priority)}
                    </Badge>
                    <Badge variant="outline">
                      {getInteractionTypeLabel(interaction.type)}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              {interaction.description && (
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {interaction.description}
                  </p>
                </CardContent>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}