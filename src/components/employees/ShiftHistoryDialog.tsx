
import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { User } from '@/types';

type ShiftHistoryDialogProps = {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  employee: User | null;
};

export function ShiftHistoryDialog({
  isOpen,
  setIsOpen,
  employee
}: ShiftHistoryDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[625px]">
        <DialogHeader>
          <DialogTitle>سجل الورديات - {employee?.name}</DialogTitle>
          <DialogDescription>
            عرض سجل الورديات للموظف
          </DialogDescription>
        </DialogHeader>
        {employee && (
          <div className="py-4">
            {!employee.shifts || employee.shifts.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                لا يوجد ورديات مسجلة لهذا الموظف
              </p>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>رقم الوردية</TableHead>
                      <TableHead>وقت البدء</TableHead>
                      <TableHead>وقت الانتهاء</TableHead>
                      <TableHead>عدد الساعات</TableHead>
                      <TableHead>الحالة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employee.shifts
                      .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
                      .map((shift, index) => (
                      <TableRow key={shift.id}>
                        <TableCell>#{index + 1}</TableCell>
                        <TableCell>
                          {new Date(shift.start_time).toLocaleTimeString('ar-EG', {
                            hour: '2-digit',
                            minute: '2-digit',
                            day: '2-digit',
                            month: '2-digit'
                          })}
                        </TableCell>
                        <TableCell>
                          {shift.end_time ? new Date(shift.end_time).toLocaleTimeString('ar-EG', {
                            hour: '2-digit',
                            minute: '2-digit',
                            day: '2-digit',
                            month: '2-digit'
                          }) : '-'}
                        </TableCell>
                        <TableCell>
                          {shift.total_hours ? shift.total_hours.toFixed(1) : '-'}
                        </TableCell>
                        <TableCell>
                          {shift.end_time ? (
                            <span className="px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">
                              مكتملة
                            </span>
                          ) : (
                            <span className="px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-800">
                              جارية
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
