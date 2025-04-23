
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail, MapPin, Pencil, Phone, User } from "lucide-react";

interface CustomerInfoCardsProps {
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  shippingAddress?: string;
  notes?: string;
}

export function CustomerInfoCards({
  customerName,
  customerEmail,
  customerPhone,
  shippingAddress,
  notes
}: CustomerInfoCardsProps) {
  const cleanedNotes = notes?.replace(/Customer Name:.*Phone:.*Applied Offer/, '') || '';
  
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="flex justify-between items-center">
            <h3 className="font-medium text-lg">ملاحظات من العميل</h3>
            <Button variant="ghost" size="sm" className="p-1 h-auto">
              <Pencil className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {cleanedNotes || 'لا توجد ملاحظات من العميل'}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="font-medium text-lg">بيانات العميل</h3>
          </div>
          
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xl">
              {customerName ? customerName.charAt(0).toUpperCase() : 'غ'}
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-primary">{customerName || 'غير معروف'}</h4>
              {customerEmail && (
                <div className="flex items-center gap-1">
                  <Mail className="h-3 w-3 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">{customerEmail}</p>
                </div>
              )}
              {customerPhone && (
                <div className="flex items-center gap-1">
                  <Phone className="h-3 w-3 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">{customerPhone}</p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {shippingAddress && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="font-medium text-lg">عنوان الشحن</h3>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground mt-1" />
                <div>
                  <p className="text-sm">{shippingAddress}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
