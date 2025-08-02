
import { Card, CardContent } from "@/components/ui/card";
import { Mail, Phone, MapPin, FileText } from "lucide-react";
import { ReactNode } from "react";

interface CustomerInfoCardsProps {
  customerName: ReactNode;
  customerEmail?: string;
  customerPhone?: string;
  shippingAddress?: string;
  notes?: string;
  governorate?: string;
  city?: string;
  area?: string;
  neighborhood?: string;
}

export function CustomerInfoCards({
  customerName,
  customerEmail,
  customerPhone,
  shippingAddress,
  notes,
  governorate,
  city,
  area,
  neighborhood
}: CustomerInfoCardsProps) {
  return (
    <div className="space-y-4">
      <h3 className="font-medium text-lg mb-2">معلومات العميل</h3>
      
      <Card>
        <CardContent className="p-5">
          <div className="space-y-4">
            <div>
              <h4 className="text-base font-medium text-gray-700 mb-1">الاسم</h4>
              <div className="text-[15px]">{customerName}</div>
            </div>
            
            {customerEmail && (
              <div>
                <h4 className="text-base font-medium text-gray-700 mb-1 flex items-center gap-1">
                  <Mail className="w-4 h-4" />
                  البريد الإلكتروني
                </h4>
                <a href={`mailto:${customerEmail}`} className="text-[15px] text-blue-600 hover:underline">
                  {customerEmail}
                </a>
              </div>
            )}
            
            {customerPhone && (
              <div>
                <h4 className="text-base font-medium text-gray-700 mb-1 flex items-center gap-1">
                  <Phone className="w-4 h-4" />
                  رقم الهاتف
                </h4>
                <a href={`tel:${customerPhone}`} className="text-[15px] text-blue-600 hover:underline ltr:block">
                  {customerPhone}
                </a>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="p-5">
          <h4 className="text-base font-medium text-gray-700 mb-2 flex items-center gap-1">
            <MapPin className="w-4 h-4" />
            معلومات الموقع والعنوان
          </h4>
          <div className="space-y-3 text-[15px]">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-600 min-w-[70px]">المحافظة:</span>
              <span className="text-gray-800">{governorate || 'غير محدد'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-600 min-w-[70px]">المدينة:</span>
              <span className="text-gray-800">{city || 'غير محدد'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-600 min-w-[70px]">المنطقة:</span>
              <span className="text-gray-800">{area || 'غير محدد'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-600 min-w-[70px]">الحي:</span>
              <span className="text-gray-800">{neighborhood || 'غير محدد'}</span>
            </div>
            {shippingAddress && (
              <div className="mt-4 pt-3 border-t border-gray-200">
                <div className="flex items-start gap-2">
                  <span className="font-medium text-gray-600 min-w-[70px] mt-0.5">العنوان:</span>
                  <p className="text-gray-800 leading-relaxed">{shippingAddress}</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      
      {notes && (
        <Card>
          <CardContent className="p-5">
            <h4 className="text-base font-medium text-gray-700 mb-2 flex items-center gap-1">
              <FileText className="w-4 h-4" />
              ملاحظات
            </h4>
            <p className="text-[15px]">{notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
