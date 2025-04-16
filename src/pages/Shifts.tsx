
import { useState, useEffect } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Shift, User } from "@/types";
import { Clock, Calendar, ClockCheck, UserPlus, Loader2, Search, Download } from "lucide-react";
import { startShift, endShift, getShifts, exportEmployeesToExcel } from "@/services/supabase/userService";
import { fetchUsers } from "@/services/supabase/userService";
import { format, parseISO, differenceInHours, differenceInMinutes } from "date-fns";
import { ar } from "date-fns/locale";

export default function Shifts() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedEmployee, setSelectedEmployee] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Fetch all users
  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ["users"],
    queryFn: fetchUsers
  });

  // Fetch shifts based on selected employee
  const { data: shifts, isLoading: shiftsLoading } = useQuery({
    queryKey: ["shifts", selectedEmployee],
    queryFn: () => getShifts(selectedEmployee),
    enabled: !!selectedEmployee
  });

  // Start shift mutation
  const startShiftMutation = useMutation({
    mutationFn: (employeeId: string) => startShift(employeeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shifts", selectedEmployee] });
      toast({
        title: "تم بدء الوردية",
        description: "تم تسجيل بدء الوردية بنجاح",
      });
    },
    onError: (error) => {
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء بدء الوردية",
        variant: "destructive",
      });
      console.error("Error starting shift:", error);
    },
  });

  // End shift mutation
  const endShiftMutation = useMutation({
    mutationFn: (shiftId: string) => endShift(shiftId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shifts", selectedEmployee] });
      toast({
        title: "تم إنهاء الوردية",
        description: "تم تسجيل انتهاء الوردية بنجاح",
      });
    },
    onError: (error) => {
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء إنهاء الوردية",
        variant: "destructive",
      });
      console.error("Error ending shift:", error);
    },
  });

  // Filter users by search term
  const filteredUsers = users?.filter(user => 
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Format date
  const formatDate = (dateString: string) => {
    try {
      return format(parseISO(dateString), "PPP", { locale: ar });
    } catch (error) {
      return dateString;
    }
  };

  // Format time
  const formatTime = (dateString: string) => {
    try {
      return format(parseISO(dateString), "p", { locale: ar });
    } catch (error) {
      return dateString;
    }
  };

  // Calculate duration
  const calculateDuration = (startTime: string, endTime?: string | null) => {
    if (!endTime) return "جارية";
    
    try {
      const start = parseISO(startTime);
      const end = parseISO(endTime);
      
      const hours = differenceInHours(end, start);
      const minutes = differenceInMinutes(end, start) % 60;
      
      return `${hours} ساعة و ${minutes} دقيقة`;
    } catch (error) {
      return "غير معروف";
    }
  };

  // Handle employee export
  const handleExport = async () => {
    try {
      await exportEmployeesToExcel();
      toast({
        title: "تم التصدير بنجاح",
        description: "تم تصدير بيانات الموظفين بنجاح",
      });
    } catch (error) {
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء تصدير البيانات",
        variant: "destructive",
      });
      console.error("Error exporting data:", error);
    }
  };

  return (
    <MainLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">إدارة الورديات</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport} className="gap-2">
            <Download size={16} />
            <span>تصدير البيانات</span>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-7">
        {/* Employees sidebar */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>الموظفين</CardTitle>
            <CardDescription>اختر موظف لإدارة وردياته</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="بحث عن موظف..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
              
              {usersLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {filteredUsers?.map((user) => (
                    <Button
                      key={user.id}
                      variant={selectedEmployee === user.id ? "default" : "outline"}
                      className="w-full justify-start text-right"
                      onClick={() => setSelectedEmployee(user.id)}
                    >
                      <div className="flex flex-col items-start">
                        <span>{user.name}</span>
                        <span className="text-xs text-muted-foreground">{user.role}</span>
                      </div>
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Shifts content */}
        <Card className="md:col-span-5">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>
                {selectedEmployee
                  ? `ورديات ${users?.find(u => u.id === selectedEmployee)?.name || ""}`
                  : "الورديات"}
              </CardTitle>
              <CardDescription>
                {selectedEmployee ? "قائمة الورديات والوقت المسجل" : "الرجاء اختيار موظف من القائمة"}
              </CardDescription>
            </div>
            {selectedEmployee && (
              <Dialog>
                <DialogTrigger asChild>
                  <Button className="gap-2">
                    <Clock size={16} />
                    <span>تسجيل وردية جديدة</span>
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>تسجيل وردية جديدة</DialogTitle>
                    <DialogDescription>
                      تسجيل بدء وردية للموظف {users?.find(u => u.id === selectedEmployee)?.name}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="flex items-center justify-center text-4xl">
                      {format(new Date(), "p", { locale: ar })}
                    </div>
                    <div className="text-center text-muted-foreground">
                      {format(new Date(), "PPP", { locale: ar })}
                    </div>
                  </div>
                  <DialogFooter>
                    <Button 
                      onClick={() => startShiftMutation.mutate(selectedEmployee)}
                      disabled={startShiftMutation.isPending}
                    >
                      {startShiftMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      تسجيل بدء الوردية
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </CardHeader>
          <CardContent>
            {!selectedEmployee ? (
              <div className="flex flex-col items-center justify-center h-60 text-muted-foreground">
                <UserPlus size={48} />
                <p className="mt-2">الرجاء اختيار موظف لعرض الورديات</p>
              </div>
            ) : shiftsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : shifts && shifts.length > 0 ? (
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>التاريخ</TableHead>
                      <TableHead>وقت البدء</TableHead>
                      <TableHead>وقت الانتهاء</TableHead>
                      <TableHead>المدة</TableHead>
                      <TableHead className="text-right">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shifts.map((shift) => (
                      <TableRow key={shift.id}>
                        <TableCell>{formatDate(shift.start_time)}</TableCell>
                        <TableCell>{formatTime(shift.start_time)}</TableCell>
                        <TableCell>
                          {shift.end_time ? formatTime(shift.end_time) : "جارية"}
                        </TableCell>
                        <TableCell>
                          {calculateDuration(shift.start_time, shift.end_time)}
                        </TableCell>
                        <TableCell className="text-right">
                          {!shift.end_time && (
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => endShiftMutation.mutate(shift.id)}
                              disabled={endShiftMutation.isPending}
                              className="gap-1"
                            >
                              {endShiftMutation.isPending && (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              )}
                              <ClockCheck size={16} />
                              <span>إنهاء</span>
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-60 text-muted-foreground">
                <Calendar size={48} />
                <p className="mt-2">لا توجد ورديات مسجلة لهذا الموظف</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
