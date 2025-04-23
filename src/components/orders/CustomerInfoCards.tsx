
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
  // استخراج بيانات العميل من الملاحظات إذا كانت موجودة
  let displayName = customerName || '';
  let displayPhone = customerPhone;
  
  // ابحث عن معلومات العميل في الملاحظات
  if (notes) {
    // استخراج اسم العميل من الملاحظات - تحسين التعبير العادي للبحث
    const nameMatch = notes.match(/Customer Name:\s*(.*?)(?=\s*Phone:|\s*Applied Offer|$)/);
    if (nameMatch && nameMatch[1] && nameMatch[1].trim() && !displayName) {
      displayName = nameMatch[1].trim();
    }
    
    // استخراج رقم الهاتف من الملاحظات - تحسين التعبير العادي للبحث
    const phoneMatch = notes.match(/Phone:\s*(.*?)(?=\s*Applied Offer|$)/);
    if (phoneMatch && phoneMatch[1] && phoneMatch[1].trim() && !displayPhone) {
      displayPhone = phoneMatch[1].trim();
    }
  }
  
  // التأكد من وجود اسم للعرض
  const hasName = displayName && displayName.trim() !== '';
  
  // تنظيف الملاحظات من بيانات العميل المكررة
  const cleanedNotes = notes?.replace(/Customer Name:.*?(?=Applied Offer|$)/, '')
                            .replace(/Phone:.*?(?=Applied Offer|$)/, '')
                            .trim() || '';
  
  // استخراج معلومات العرض المطبق
  const hasOffer = notes?.includes('Applied Offer');
  const offerInfo = hasOffer ? notes?.match(/Applied Offer:\s*(.*?)($)/)?.[1]?.trim() : '';
  
  return (
    <div className="space-y-6">
      {cleanedNotes || offerInfo ? (
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex justify-between items-center">
              <h3 className="font-medium text-lg">ملاحظات من العميل</h3>
              <Button variant="ghost" size="sm" className="p-1 h-auto">
                <Pencil className="h-4 w-4" />
              </Button>
            </div>
            {cleanedNotes && (
              <p className="text-sm text-muted-foreground">
                {cleanedNotes}
              </p>
            )}
            {offerInfo && (
              <div className={`${cleanedNotes ? "mt-2 pt-2 border-t" : ""}`}>
                <p className="text-sm font-medium">العرض المطبق: {offerInfo}</p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="font-medium text-lg">بيانات العميل</h3>
          </div>
          
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xl">
              {hasName ? displayName.charAt(0).toUpperCase() : 'غ'}
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-primary">{hasName ? displayName : 'غير معروف'}</h4>
              {customerEmail && (
                <div className="flex items-center gap-1">
                  <Mail className="h-3 w-3 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">{customerEmail}</p>
                </div>
              )}
              {displayPhone && (
                <div className="flex items-center gap-1">
                  <Phone className="h-3 w-3 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">{displayPhone}</p>
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
