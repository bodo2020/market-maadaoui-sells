import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { MapPin, Plus, Minus, Navigation, Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

declare global {
  interface Window {
    google: any;
    initMap: () => void;
  }
}

interface NeighborhoodSelection {
  id: string;
  name: string;
  price: number;
  estimated_time: string;
  priority: number;
  is_primary: boolean;
  governorate?: string;
  city?: string;
  area?: string;
}

interface Props {
  availableNeighborhoods: any[];
  selectedNeighborhoods: Map<string, NeighborhoodSelection>;
  onNeighborhoodToggle: (neighborhood: any, checked: boolean) => void;
  onNeighborhoodUpdate: (neighborhoodId: string, field: keyof NeighborhoodSelection, value: any) => void;
}

export function NeighborhoodMapSelector({ 
  availableNeighborhoods, 
  selectedNeighborhoods,
  onNeighborhoodToggle,
  onNeighborhoodUpdate
}: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [markers, setMarkers] = useState<Map<string, any>>(new Map());
  const [selectedOnMap, setSelectedOnMap] = useState<string | null>(null);
  
  const API_KEY = 'AIzaSyBhWG1SZE7DCk9qiC4dCs82oqq3GWkVEhg';
  const CENTER_LOCATION = { lat: 30.0444, lng: 31.2357 }; // Cairo, Egypt

  useEffect(() => {
    const loadGoogleMaps = () => {
      if (window.google) {
        initializeMap();
        return;
      }

      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=places&language=ar&region=EG`;
      script.async = true;
      script.defer = true;
      window.initMap = initializeMap;
      script.onload = () => setIsLoaded(true);
      document.head.appendChild(script);
    };

    const initializeMap = () => {
      if (!mapRef.current) return;

      const mapInstance = new window.google.maps.Map(mapRef.current, {
        center: CENTER_LOCATION,
        zoom: 10,
        mapTypeId: 'roadmap',
        zoomControl: false,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        styles: [
          {
            featureType: 'poi',
            elementType: 'labels',
            stylers: [{ visibility: 'simplified' }]
          }
        ]
      });

      setMap(mapInstance);
    };

    loadGoogleMaps();
  }, []);

  useEffect(() => {
    if (!map || !window.google) return;

    // Clear existing markers
    markers.forEach(marker => marker.setMap(null));
    const newMarkers = new Map();

    // Add markers for available neighborhoods (approximated locations)
    availableNeighborhoods.forEach((neighborhood, index) => {
      const isSelected = selectedNeighborhoods.has(neighborhood.id);
      const isHighlighted = selectedOnMap === neighborhood.id;
      
      // Create approximate position (you can later fetch real coordinates)
      const lat = CENTER_LOCATION.lat + (Math.random() - 0.5) * 0.5;
      const lng = CENTER_LOCATION.lng + (Math.random() - 0.5) * 0.5;

      const marker = new window.google.maps.Marker({
        position: { lat, lng },
        map: map,
        title: neighborhood.name,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: isHighlighted ? 12 : isSelected ? 10 : 8,
          fillColor: isSelected ? '#22c55e' : '#3b82f6',
          fillOpacity: isHighlighted ? 1 : 0.8,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
        label: {
          text: neighborhood.name.substring(0, 2),
          color: '#ffffff',
          fontSize: '10px',
          fontWeight: 'bold'
        }
      });

      // Add click listener
      marker.addListener('click', () => {
        setSelectedOnMap(neighborhood.id);
        if (!isSelected) {
          onNeighborhoodToggle(neighborhood, true);
        }
      });

      // Add info window
      const infoWindow = new window.google.maps.InfoWindow({
        content: `
          <div style="direction: rtl; padding: 8px; font-family: Arial;">
            <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: bold;">${neighborhood.name}</h3>
            <p style="margin: 4px 0; font-size: 12px; color: #666;">
              ${neighborhood.areas?.name || ''} - ${neighborhood.areas?.cities?.name || ''}
            </p>
            <p style="margin: 4px 0; font-size: 12px; color: #666;">
              ${neighborhood.areas?.cities?.governorates?.name || ''}
            </p>
          </div>
        `
      });

      marker.addListener('mouseover', () => {
        infoWindow.open(map, marker);
      });

      marker.addListener('mouseout', () => {
        infoWindow.close();
      });

      newMarkers.set(neighborhood.id, marker);
    });

    setMarkers(newMarkers);
  }, [map, availableNeighborhoods, selectedNeighborhoods, selectedOnMap]);

  const zoomIn = () => map?.setZoom(map.getZoom() + 1);
  const zoomOut = () => map?.setZoom(map.getZoom() - 1);
  const resetView = () => {
    map?.setCenter(CENTER_LOCATION);
    map?.setZoom(10);
  };

  const focusOnNeighborhood = (neighborhoodId: string) => {
    const marker = markers.get(neighborhoodId);
    if (marker && map) {
      map.setCenter(marker.getPosition());
      map.setZoom(14);
      setSelectedOnMap(neighborhoodId);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[600px]">
      {/* Map Section */}
      <div className="lg:col-span-2 relative rounded-lg overflow-hidden border">
        {!isLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/50 z-10">
            <div className="text-center space-y-2">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
              <p className="text-sm text-muted-foreground">جاري تحميل الخريطة...</p>
            </div>
          </div>
        )}
        
        <div ref={mapRef} className="w-full h-full" />
        
        {/* Map Controls */}
        <div className="absolute left-4 top-4 flex flex-col gap-2">
          <Button onClick={zoomIn} size="icon" variant="outline" className="bg-background shadow-md">
            <Plus className="w-4 h-4" />
          </Button>
          <Button onClick={zoomOut} size="icon" variant="outline" className="bg-background shadow-md">
            <Minus className="w-4 h-4" />
          </Button>
          <Button onClick={resetView} size="icon" variant="outline" className="bg-background shadow-md">
            <Navigation className="w-4 h-4" />
          </Button>
        </div>

        {/* Legend */}
        <Card className="absolute right-4 top-4 shadow-md">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span>أحياء متاحة</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span>محدد</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Selected Neighborhoods Panel */}
      <div className="border rounded-lg p-4">
        <div className="flex items-center gap-2 mb-4">
          <MapPin className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">الأحياء المحددة ({selectedNeighborhoods.size})</h3>
        </div>
        
        <ScrollArea className="h-[520px]">
          {selectedNeighborhoods.size === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <MapPin className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p>اضغط على الخريطة لتحديد الأحياء</p>
            </div>
          ) : (
            <div className="space-y-4">
              {Array.from(selectedNeighborhoods.entries()).map(([id, data]) => {
                const neighborhood = availableNeighborhoods.find(n => n.id === id);
                if (!neighborhood) return null;

                return (
                  <Card 
                    key={id} 
                    className={`cursor-pointer transition-colors ${
                      selectedOnMap === id ? 'ring-2 ring-primary' : ''
                    }`}
                    onClick={() => focusOnNeighborhood(id)}
                  >
                    <CardContent className="p-3 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="font-medium text-sm">{data.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {neighborhood.areas?.cities?.governorates?.name}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            onNeighborhoodToggle(neighborhood, false);
                          }}
                        >
                          ×
                        </Button>
                      </div>

                      <div className="space-y-2">
                        <div>
                          <Label className="text-xs">السعر (ج.م)</Label>
                          <Input
                            type="number"
                            value={data.price}
                            onChange={(e) => onNeighborhoodUpdate(id, 'price', parseFloat(e.target.value) || 0)}
                            className="h-7 text-xs"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>

                        <div>
                          <Label className="text-xs">الوقت المتوقع</Label>
                          <Input
                            type="text"
                            placeholder="30-45 دقيقة"
                            value={data.estimated_time}
                            onChange={(e) => onNeighborhoodUpdate(id, 'estimated_time', e.target.value)}
                            className="h-7 text-xs"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">الأولوية</Label>
                            <Input
                              type="number"
                              value={data.priority}
                              onChange={(e) => onNeighborhoodUpdate(id, 'priority', parseInt(e.target.value) || 1)}
                              className="h-7 text-xs"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>

                          <div className="flex items-center gap-1 pt-5">
                            <Checkbox
                              id={`primary-map-${id}`}
                              checked={data.is_primary}
                              onCheckedChange={(checked) => onNeighborhoodUpdate(id, 'is_primary', checked as boolean)}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <label htmlFor={`primary-map-${id}`} className="text-xs cursor-pointer">
                              رئيسي
                            </label>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
