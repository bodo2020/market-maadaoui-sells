import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, DollarSign, Clock, Star, Trash2 } from "lucide-react";
import type { DeliveryZone } from "@/types/deliveryZone";

interface Props {
  zones: DeliveryZone[];
  onZoneClick?: (zone: DeliveryZone) => void;
  onDeleteZone?: (zoneId: string) => void;
}

export function DeliveryZonesList({ zones, onZoneClick, onDeleteZone }: Props) {
  if (zones.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <MapPin className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">لا توجد مناطق توصيل محددة</p>
          <p className="text-sm text-muted-foreground mt-2">
            ابدأ برسم مناطق التوصيل على الخريطة
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {zones.map((zone) => (
        <Card
          key={zone.id}
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => onZoneClick?.(zone)}
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="w-4 h-4 rounded-full border-2"
                    style={{
                      backgroundColor: zone.color,
                      borderColor: zone.color,
                    }}
                  />
                  <h3 className="font-semibold">{zone.zone_name}</h3>
                  {zone.priority === 1 && (
                    <Badge variant="secondary" className="text-xs">
                      <Star className="h-3 w-3 ml-1" />
                      أولوية عالية
                    </Badge>
                  )}
                </div>

                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <DollarSign className="h-4 w-4" />
                    <span>{zone.delivery_price} جنيه</span>
                  </div>

                  {zone.estimated_time && (
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      <span>{zone.estimated_time}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-1">
                    <Star className="h-4 w-4" />
                    <span>أولوية {zone.priority}</span>
                  </div>
                </div>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteZone?.(zone.id);
                }}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
