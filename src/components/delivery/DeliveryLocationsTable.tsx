
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { fetchDeliveryLocations, deleteDeliveryLocation } from "@/services/supabase/deliveryService";
import DeliveryLocationDialog from "./DeliveryLocationDialog";

interface DeliveryLocation {
  id: string;
  name: string;
  price: number;
  estimated_time?: string;
  active: boolean;
  notes?: string;
}

export default function DeliveryLocationsTable() {
  const [locations, setLocations] = useState<DeliveryLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [locationToDelete, setLocationToDelete] = useState<string | null>(null);
  const [editLocation, setEditLocation] = useState<DeliveryLocation | null>(null);

  useEffect(() => {
    loadLocations();
  }, []);

  const loadLocations = async () => {
    try {
      setLoading(true);
      const data = await fetchDeliveryLocations();
      setLocations(data);
    } catch (error) {
      console.error('Error loading delivery locations:', error);
      toast.error("حدث خطأ أثناء تحميل مناطق التوصيل");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDeliveryLocation(id);
      toast.success("تم حذف منطقة التوصيل بنجاح");
      await loadLocations();
    } catch (error) {
      console.error('Error deleting delivery location:', error);
      toast.error("حدث خطأ أثناء حذف منطقة التوصيل");
    }
  };

  if (loading) {
    return <div className="text-center p-4">جاري التحميل...</div>;
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>المحافظة</TableHead>
              <TableHead>المدينة</TableHead>
              <TableHead>المنطقة</TableHead>
              <TableHead>الحي</TableHead>
              <TableHead>سعر التوصيل</TableHead>
              <TableHead>الوقت المتوقع</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead>ملاحظات</TableHead>
              <TableHead>الإجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {locations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center">
                  لا توجد مناطق توصيل مسجلة
                </TableCell>
              </TableRow>
            ) : (
              locations.map((location) => (
                <TableRow key={location.id}>
                  <TableCell>{location.governorate || "-"}</TableCell>
                  <TableCell>{location.city || "-"}</TableCell>
                  <TableCell>{location.area || "-"}</TableCell>
                  <TableCell>{location.neighborhood || "-"}</TableCell>
                  <TableCell>{location.price}</TableCell>
                  <TableCell>{location.estimated_time || "-"}</TableCell>
                  <TableCell>
                    <Badge variant={location.active ? "default" : "secondary"}>
                      {location.active ? "مفعل" : "غير مفعل"}
                    </Badge>
                  </TableCell>
                  <TableCell>{location.notes || "-"}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditLocation(location)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setLocationToDelete(location.id);
                          setDeleteConfirmOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>هل أنت متأكد من حذف منطقة التوصيل؟</AlertDialogTitle>
            <AlertDialogDescription>
              لا يمكن التراجع عن هذا الإجراء بعد تنفيذه.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (locationToDelete) {
                  handleDelete(locationToDelete);
                  setDeleteConfirmOpen(false);
                }
              }}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DeliveryLocationDialog
        open={editLocation !== null}
        onOpenChange={(open) => !open && setEditLocation(null)}
        location={editLocation || undefined}
      />
    </>
  );
}
