import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MapPin, Search, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { verifyCustomerLocation } from "@/services/supabase/deliveryZoneService";

export function CustomerLocationVerifier() {
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");

  const verifyMutation = useMutation({
    mutationFn: ({ lat, lng }: { lat: number; lng: number }) =>
      verifyCustomerLocation(lat, lng),
  });

  const handleVerify = () => {
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lng)) {
      return;
    }

    verifyMutation.mutate({ lat, lng });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          التحقق من موقع العميل
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>خط العرض (Latitude)</Label>
            <Input
              type="number"
              step="0.000001"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              placeholder="30.0444"
            />
          </div>

          <div className="space-y-2">
            <Label>خط الطول (Longitude)</Label>
            <Input
              type="number"
              step="0.000001"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              placeholder="31.2357"
            />
          </div>
        </div>

        <Button
          onClick={handleVerify}
          disabled={!latitude || !longitude || verifyMutation.isPending}
          className="w-full"
        >
          {verifyMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin ml-2" />
          ) : (
            <Search className="h-4 w-4 ml-2" />
          )}
          التحقق من الموقع
        </Button>

        {verifyMutation.data && (
          <Alert
            className={
              verifyMutation.data.isInZone
                ? "border-green-500 bg-green-50 dark:bg-green-950"
                : "border-red-500 bg-red-50 dark:bg-red-950"
            }
          >
            {verifyMutation.data.isInZone ? (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            ) : (
              <XCircle className="h-4 w-4 text-red-600" />
            )}
            <AlertDescription>
              {verifyMutation.data.isInZone ? (
                <div className="space-y-2">
                  <p className="font-semibold text-green-800 dark:text-green-200">
                    ✅ الموقع داخل منطقة التوصيل
                  </p>
                  {verifyMutation.data.zone && (
                    <div className="text-sm space-y-1 text-green-700 dark:text-green-300">
                      <p>
                        <strong>المنطقة:</strong>{" "}
                        {verifyMutation.data.zone.zone_name}
                      </p>
                      <p>
                        <strong>الفرع:</strong>{" "}
                        {verifyMutation.data.zone.branch_name}
                      </p>
                      <p>
                        <strong>سعر التوصيل:</strong>{" "}
                        {verifyMutation.data.zone.delivery_price} جنيه
                      </p>
                      {verifyMutation.data.zone.estimated_time && (
                        <p>
                          <strong>الوقت المتوقع:</strong>{" "}
                          {verifyMutation.data.zone.estimated_time}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="font-semibold text-red-800 dark:text-red-200">
                  ❌ الموقع خارج مناطق التوصيل
                </p>
              )}
            </AlertDescription>
          </Alert>
        )}

        <div className="text-sm text-muted-foreground">
          <p className="font-semibold mb-2">نصائح:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>يمكنك الحصول على الإحداثيات من Google Maps</li>
            <li>انقر بزر الماوس الأيمن على الخريطة واختر "ما هذا المكان؟"</li>
            <li>استخدم موقع GPS الحقيقي من هاتف العميل للدقة</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
