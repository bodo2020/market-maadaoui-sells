import React, { useEffect, useRef, useState } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Navigation, Minus, Plus } from 'lucide-react';
declare global {
  interface Window {
    google: any;
    initMap: () => void;
  }
}
const MapPage = () => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);
  const API_KEY = 'AIzaSyBhWG1SZE7DCk9qiC4dCs82oqq3GWkVEhg';
  const CENTER_LOCATION = {
    lat: 31.2566,
    lng: 31.1671
  }; // المنصورة، مصر

  useEffect(() => {
    // Load Google Maps script
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
      script.onload = () => {
        setIsLoaded(true);
      };
      document.head.appendChild(script);
    };
    const initializeMap = () => {
      if (!mapRef.current) return;
      const mapInstance = new window.google.maps.Map(mapRef.current, {
        center: CENTER_LOCATION,
        zoom: 13,
        mapTypeId: 'roadmap',
        zoomControl: false,
        mapTypeControl: false,
        scaleControl: true,
        streetViewControl: false,
        rotateControl: false,
        fullscreenControl: false,
        styles: [{
          featureType: 'poi',
          elementType: 'labels.text',
          stylers: [{
            visibility: 'on'
          }]
        }]
      });

      // Add a marker at the center location
      new window.google.maps.Marker({
        position: CENTER_LOCATION,
        map: mapInstance,
        title: 'الموقع المحدد',
        icon: {
          url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="#dc2626"/>
            </svg>
          `),
          scaledSize: new window.google.maps.Size(24, 24),
          anchor: new window.google.maps.Point(12, 24)
        }
      });
      setMap(mapInstance);
    };
    loadGoogleMaps();
  }, []);
  const handleSearch = () => {
    if (!map || !searchQuery || !window.google) return;
    const service = new window.google.maps.places.PlacesService(map);
    const request = {
      query: searchQuery,
      location: CENTER_LOCATION,
      radius: 50000,
      language: 'ar'
    };
    service.textSearch(request, (results: any[], status: any) => {
      if (status === window.google.maps.places.PlacesServiceStatus.OK && results[0]) {
        map.setCenter(results[0].geometry.location);
        map.setZoom(15);
        new window.google.maps.Marker({
          position: results[0].geometry.location,
          map: map,
          title: results[0].name
        });
      }
    });
  };
  const zoomIn = () => {
    if (map) {
      map.setZoom(map.getZoom() + 1);
    }
  };
  const zoomOut = () => {
    if (map) {
      map.setZoom(map.getZoom() - 1);
    }
  };
  const resetToCenter = () => {
    if (map) {
      map.setCenter(CENTER_LOCATION);
      map.setZoom(13);
    }
  };
  return <MainLayout>
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="bg-white p-4 shadow-sm border-b">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-blue-600">
              <Navigation className="w-5 h-5" />
              <h1 className="text-xl font-semibold">خريطة تفاعلية مع الطرق</h1>
            </div>
            
            <div className="flex-1 max-w-md">
              <div className="relative">
                <Input type="text" placeholder="ابحث عن موقع..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleSearch()} className="pl-10" />
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              </div>
            </div>
            
            <Button onClick={handleSearch} className="bg-blue-600 hover:bg-blue-700">
              بحث
            </Button>
          </div>
        </div>

        {/* Map Container */}
        <div className="flex-1 relative">
          {/* Loading indicator */}
          {!isLoaded && <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">جاري تحميل الخريطة...</p>
              </div>
            </div>}

          {/* Map */}
          <div ref={mapRef} className="w-full h-full" />

          {/* Map Controls */}
          <div className="absolute left-4 top-4 flex flex-col gap-2">
            <Button onClick={zoomIn} size="icon" variant="outline" className="bg-white shadow-md hover:bg-gray-50">
              <Plus className="w-4 h-4" />
            </Button>
            <Button onClick={zoomOut} size="icon" variant="outline" className="bg-white shadow-md hover:bg-gray-50">
              <Minus className="w-4 h-4" />
            </Button>
            <Button onClick={resetToCenter} size="icon" variant="outline" className="bg-white shadow-md hover:bg-gray-50">
              <Navigation className="w-4 h-4" />
            </Button>
          </div>

          {/* Map Info Panel */}
          

          {/* Distance and Time Info */}
          
        </div>
      </div>
    </MainLayout>;
};
export default MapPage;