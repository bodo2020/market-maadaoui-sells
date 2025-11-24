import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Trash2, Edit2, ZoomIn, ZoomOut, Home } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { saveDeliveryZone, updateDeliveryZone, deleteDeliveryZone } from "@/services/supabase/deliveryZoneService";
import type { DeliveryZone } from "@/types/deliveryZone";

// Extend Window interface for Google Maps
declare global {
  interface Window {
    google: any;
    initMap: () => void;
  }
}

interface Props {
  branchId: string;
  zones: DeliveryZone[];
}

export function BranchDeliveryZoneMapper({ branchId, zones }: Props) {
  const [map, setMap] = useState<any>(null);
  const [drawingManager, setDrawingManager] = useState<any>(null);
  const [polygons, setPolygons] = useState<any[]>([]);
  const [selectedPolygon, setSelectedPolygon] = useState<any>(null);
  const [editingZone, setEditingZone] = useState<DeliveryZone | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const mapRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Zone details form
  const [zoneName, setZoneName] = useState("");
  const [deliveryPrice, setDeliveryPrice] = useState("0");
  const [estimatedTime, setEstimatedTime] = useState("");
  const [zoneColor, setZoneColor] = useState("#3B82F6");
  const [priority, setPriority] = useState("1");

  // Mutation for saving zone
  const saveZoneMutation = useMutation({
    mutationFn: (data: any) => saveDeliveryZone(branchId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branch-delivery-zones", branchId] });
      toast.success("تم حفظ المنطقة بنجاح");
      resetForm();
      setSelectedPolygon(null);
    },
    onError: () => {
      toast.error("فشل حفظ المنطقة");
    },
  });

  // Mutation for updating zone
  const updateZoneMutation = useMutation({
    mutationFn: ({ zoneId, updates }: { zoneId: string; updates: any }) =>
      updateDeliveryZone(zoneId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branch-delivery-zones", branchId] });
      toast.success("تم تحديث المنطقة بنجاح");
      setEditingZone(null);
      resetForm();
    },
    onError: () => {
      toast.error("فشل تحديث المنطقة");
    },
  });

  // Mutation for deleting zone
  const deleteZoneMutation = useMutation({
    mutationFn: deleteDeliveryZone,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branch-delivery-zones", branchId] });
      toast.success("تم حذف المنطقة بنجاح");
    },
    onError: () => {
      toast.error("فشل حذف المنطقة");
    },
  });

  // Load Google Maps API
  useEffect(() => {
    if (window.google) {
      initializeMap();
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=AIzaSyCzjmLl8KWNlZqXcfefOPsCYRmVLJWLxoE&libraries=drawing,places&language=ar`;
    script.async = true;
    script.defer = true;
    window.initMap = initializeMap;
    script.onload = () => {
      if (window.google) {
        initializeMap();
      }
    };
    document.head.appendChild(script);

    return () => {
      delete window.initMap;
    };
  }, []);

  const initializeMap = () => {
    if (!mapRef.current || !window.google) return;

    const mapInstance = new window.google.maps.Map(mapRef.current, {
      center: { lat: 30.0444, lng: 31.2357 }, // Cairo, Egypt
      zoom: 12,
      mapTypeControl: true,
      streetViewControl: false,
      fullscreenControl: true,
    });

    const drawingManagerInstance = new window.google.maps.drawing.DrawingManager({
      drawingMode: null,
      drawingControl: true,
      drawingControlOptions: {
        position: window.google.maps.ControlPosition.TOP_CENTER,
        drawingModes: [
          window.google.maps.drawing.OverlayType.POLYGON,
        ],
      },
      polygonOptions: {
        fillColor: zoneColor,
        fillOpacity: 0.3,
        strokeWeight: 2,
        strokeColor: zoneColor,
        editable: true,
        draggable: false,
      },
    });

    drawingManagerInstance.setMap(mapInstance);

    // Handle polygon completion
    window.google.maps.event.addListener(
      drawingManagerInstance,
      "polygoncomplete",
      (polygon: any) => {
        handlePolygonComplete(polygon);
      }
    );

    setMap(mapInstance);
    setDrawingManager(drawingManagerInstance);
    setIsLoading(false);

    // Load existing zones
    loadExistingZones(mapInstance);
  };

  const loadExistingZones = (mapInstance: any) => {
    if (!zones || zones.length === 0) return;

    const loadedPolygons: any[] = [];

    zones.forEach((zone) => {
      if (!zone.polygon_coordinates?.coordinates?.[0]) return;

      const paths = zone.polygon_coordinates.coordinates[0].map((coord: number[]) => ({
        lat: coord[1],
        lng: coord[0],
      }));

      const polygon = new window.google.maps.Polygon({
        paths,
        fillColor: zone.color,
        fillOpacity: 0.3,
        strokeWeight: 2,
        strokeColor: zone.color,
        editable: true,
        draggable: false,
      });

      polygon.setMap(mapInstance);
      polygon.zoneData = zone;

      // Add click listener
      window.google.maps.event.addListener(polygon, "click", () => {
        selectPolygon(polygon);
      });

      loadedPolygons.push(polygon);
    });

    setPolygons(loadedPolygons);
  };

  const handlePolygonComplete = (polygon: any) => {
    setSelectedPolygon(polygon);
    setPolygons([...polygons, polygon]);
    
    // Add click listener
    window.google.maps.event.addListener(polygon, "click", () => {
      selectPolygon(polygon);
    });

    // Disable drawing mode
    if (drawingManager) {
      drawingManager.setDrawingMode(null);
    }

    toast.info("تم رسم المنطقة، قم بملء التفاصيل وحفظها");
  };

  const selectPolygon = (polygon: any) => {
    // Deselect previous
    if (selectedPolygon && selectedPolygon !== polygon) {
      selectedPolygon.setOptions({
        strokeWeight: 2,
        fillOpacity: 0.3,
      });
    }

    // Select new
    polygon.setOptions({
      strokeWeight: 4,
      fillOpacity: 0.5,
    });

    setSelectedPolygon(polygon);

    // If this polygon has zone data, load it
    if (polygon.zoneData) {
      setEditingZone(polygon.zoneData);
      setZoneName(polygon.zoneData.zone_name);
      setDeliveryPrice(polygon.zoneData.delivery_price.toString());
      setEstimatedTime(polygon.zoneData.estimated_time || "");
      setZoneColor(polygon.zoneData.color);
      setPriority(polygon.zoneData.priority.toString());
    }
  };

  const handleSaveZone = () => {
    if (!selectedPolygon) {
      toast.error("لم يتم تحديد منطقة");
      return;
    }

    if (!zoneName.trim()) {
      toast.error("يجب إدخال اسم المنطقة");
      return;
    }

    const path = selectedPolygon.getPath();
    const coordinates: number[][] = [];
    
    for (let i = 0; i < path.getLength(); i++) {
      const point = path.getAt(i);
      coordinates.push([point.lng(), point.lat()]);
    }
    
    // Close the polygon
    coordinates.push(coordinates[0]);

    const geoJson = {
      type: "Polygon" as const,
      coordinates: [coordinates],
    };

    const zoneData = {
      zone_name: zoneName,
      polygon_coordinates: geoJson,
      delivery_price: parseFloat(deliveryPrice) || 0,
      estimated_time: estimatedTime || undefined,
      priority: parseInt(priority) || 1,
      color: zoneColor,
    };

    if (editingZone) {
      updateZoneMutation.mutate({
        zoneId: editingZone.id,
        updates: zoneData,
      });
    } else {
      saveZoneMutation.mutate(zoneData);
    }
  };

  const handleDeleteZone = () => {
    if (!selectedPolygon) return;

    if (selectedPolygon.zoneData) {
      deleteZoneMutation.mutate(selectedPolygon.zoneData.id);
    }

    selectedPolygon.setMap(null);
    setPolygons(polygons.filter((p) => p !== selectedPolygon));
    setSelectedPolygon(null);
    resetForm();
  };

  const resetForm = () => {
    setZoneName("");
    setDeliveryPrice("0");
    setEstimatedTime("");
    setZoneColor("#3B82F6");
    setPriority("1");
    setEditingZone(null);
  };

  const zoomIn = () => {
    if (map) map.setZoom(map.getZoom() + 1);
  };

  const zoomOut = () => {
    if (map) map.setZoom(map.getZoom() - 1);
  };

  const resetView = () => {
    if (map) {
      map.setCenter({ lat: 30.0444, lng: 31.2357 });
      map.setZoom(12);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Map Section */}
      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>خريطة مناطق التوصيل</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={zoomIn}>
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={zoomOut}>
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={resetView}>
                  <Home className="h-4 w-4" />
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading && (
              <div className="flex items-center justify-center h-[600px]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            )}
            <div
              ref={mapRef}
              className="w-full h-[600px] rounded-lg"
              style={{ display: isLoading ? "none" : "block" }}
            />
          </CardContent>
        </Card>
      </div>

      {/* Control Panel */}
      <div>
        <Card>
          <CardHeader>
            <CardTitle>تفاصيل المنطقة</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>اسم المنطقة</Label>
              <Input
                value={zoneName}
                onChange={(e) => setZoneName(e.target.value)}
                placeholder="مثال: وسط البلد"
              />
            </div>

            <div className="space-y-2">
              <Label>سعر التوصيل (جنيه)</Label>
              <Input
                type="number"
                value={deliveryPrice}
                onChange={(e) => setDeliveryPrice(e.target.value)}
                placeholder="0"
              />
            </div>

            <div className="space-y-2">
              <Label>الوقت المتوقع</Label>
              <Input
                value={estimatedTime}
                onChange={(e) => setEstimatedTime(e.target.value)}
                placeholder="مثال: 30-45 دقيقة"
              />
            </div>

            <div className="space-y-2">
              <Label>الأولوية</Label>
              <Input
                type="number"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                placeholder="1"
              />
            </div>

            <div className="space-y-2">
              <Label>لون المنطقة</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={zoneColor}
                  onChange={(e) => setZoneColor(e.target.value)}
                  className="w-20 h-10"
                />
                <Input
                  value={zoneColor}
                  onChange={(e) => setZoneColor(e.target.value)}
                  placeholder="#3B82F6"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                onClick={handleSaveZone}
                disabled={
                  !selectedPolygon ||
                  saveZoneMutation.isPending ||
                  updateZoneMutation.isPending
                }
                className="flex-1"
              >
                {saveZoneMutation.isPending || updateZoneMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin ml-2" />
                ) : editingZone ? (
                  <Edit2 className="h-4 w-4 ml-2" />
                ) : (
                  <Plus className="h-4 w-4 ml-2" />
                )}
                {editingZone ? "تحديث" : "حفظ"}
              </Button>

              {selectedPolygon && (
                <Button
                  variant="destructive"
                  onClick={handleDeleteZone}
                  disabled={deleteZoneMutation.isPending}
                >
                  {deleteZoneMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>

            <div className="text-sm text-muted-foreground pt-4 space-y-2">
              <p className="font-semibold">التعليمات:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>انقر على أداة المضلع في الخريطة</li>
                <li>ارسم حدود منطقة التوصيل</li>
                <li>املأ تفاصيل المنطقة واحفظها</li>
                <li>يمكنك تعديل المضلع بسحب النقاط</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
