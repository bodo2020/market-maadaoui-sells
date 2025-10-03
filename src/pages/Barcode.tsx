import { useState, useEffect, useRef } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Printer, Edit, Save, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import JsBarcode from "jsbarcode";
import { fetchStoreSettings, StoreSettings } from "@/services/supabase/storeService";

interface Product {
  id: string;
  name: string;
  barcode?: string;
  bulk_barcode?: string;
  price: number;
  bulk_price?: number;
  is_bulk: boolean;
  bulk_enabled: boolean;
  company_id?: string;
  companies?: {
    name: string;
  };
}


// Simple Barcode Display Component
const SimpleBarcodeDisplay = ({ value, productName, storeName, className }: { 
  value: string; 
  productName: string;
  storeName: string;
  className?: string;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current && value) {
      try {
        JsBarcode(canvasRef.current, value, {
          format: 'CODE128',
          width: 1.5,
          height: 40,
          displayValue: false,
          background: 'white',
          lineColor: 'black',
          margin: 2
        });
      } catch (error) {
        console.error('Error generating barcode:', error);
      }
    }
  }, [value]);

  return (
    <div className="space-y-1">
      <canvas ref={canvasRef} className={className} />
      <div className="text-xs text-center space-y-1">
        <div className="font-medium">{productName}</div>
        <div className="text-muted-foreground">{storeName}</div>
      </div>
    </div>
  );
};

export default function Barcode() {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
  const [editingProduct, setEditingProduct] = useState<string | null>(null);
  const [editingBarcode, setEditingBarcode] = useState({ barcode: '', bulk_barcode: '' });

  useEffect(() => {
    fetchProducts();
    fetchStoreData();
  }, []);


  const requestUSBDevice = async () => {
    toast.info('تم تعطيل إعدادات الطابعة. الطباعة تتم عبر الويب.');
  };

  const requestBluetoothDevice = async () => {
    toast.info('تم تعطيل إعدادات الطابعة. الطباعة تتم عبر الويب.');
  };

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('products')
        .select(`
          id,
          name,
          barcode,
          bulk_barcode,
          price,
          bulk_price,
          is_bulk,
          bulk_enabled,
          company_id,
          companies (
            name
          )
        `)
        .order('name');

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
      toast.error('حدث خطأ في تحميل المنتجات');
    } finally {
      setLoading(false);
    }
  };

  const fetchStoreData = async () => {
    try {
      const settings = await fetchStoreSettings();
      setStoreSettings(settings);
    } catch (error) {
      console.error('Error fetching store settings:', error);
    }
  };

  const startEditing = (product: Product) => {
    setEditingProduct(product.id);
    setEditingBarcode({
      barcode: product.barcode || '',
      bulk_barcode: product.bulk_barcode || ''
    });
  };

  const cancelEditing = () => {
    setEditingProduct(null);
    setEditingBarcode({ barcode: '', bulk_barcode: '' });
  };

  const saveBarcode = async (productId: string) => {
    try {
      const { error } = await supabase
        .from('products')
        .update({
          barcode: editingBarcode.barcode || null,
          bulk_barcode: editingBarcode.bulk_barcode || null
        })
        .eq('id', productId);

      if (error) throw error;

      // Update local state
      setProducts(prev => prev.map(p => 
        p.id === productId 
          ? { ...p, barcode: editingBarcode.barcode, bulk_barcode: editingBarcode.bulk_barcode }
          : p
      ));

      toast.success('تم حفظ الباركود بنجاح');
      cancelEditing();
    } catch (error) {
      console.error('Error saving barcode:', error);
      toast.error('حدث خطأ في حفظ الباركود');
    }
  };

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.barcode?.includes(searchTerm) ||
    product.bulk_barcode?.includes(searchTerm)
  );

  const toggleProductSelection = (productId: string) => {
    const newSelected = new Set(selectedProducts);
    if (newSelected.has(productId)) {
      newSelected.delete(productId);
    } else {
      newSelected.add(productId);
    }
    setSelectedProducts(newSelected);
  };

  const printSelectedBarcodes = () => {
    if (selectedProducts.size === 0) {
      toast.error('يرجى اختيار منتج واحد على الأقل للطباعة');
      return;
    }

    const items = products
      .filter(p => selectedProducts.has(p.id))
      .map(p => ({
        name: p.name,
        value: p.barcode || ''
      }))
      .filter(i => i.value);

    if (items.length === 0) {
      toast.error('لا توجد باركودات صالحة للطباعة');
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('لا يمكن فتح نافذة الطباعة');
      return;
    }

    const storeName = storeSettings?.name || '';

    const generateDataURL = (value: string) => {
      const canvas = document.createElement('canvas');
      try {
        JsBarcode(canvas, value, {
          format: 'CODE128',
          width: 2,
          height: 60,
          displayValue: false,
          background: '#ffffff',
          lineColor: '#000000',
          margin: 0
        });
        return canvas.toDataURL('image/png');
      } catch {
        return '';
      }
    };

    const labels = items.map(i => {
      const url = generateDataURL(i.value);
      return url ? `
        <div class="label">
          <img src="${url}" alt="${i.name}" />
          <div class="meta">${i.name}${storeName ? ' — ' + storeName : ''}</div>
        </div>
      ` : '';
    }).join('');

    printWindow.document.write(`
      <html dir="rtl" lang="ar">
        <head>
          <meta charSet="UTF-8" />
          <title>طباعة باركود</title>
          <style>
            @page { size: 25mm auto; margin: 0; }
            html, body { margin: 0; padding: 6px; font-family: Arial, sans-serif; }
            .label { width: 25mm; max-width: 25mm; padding: 4px 0; text-align: center; page-break-inside: avoid; break-inside: avoid; -webkit-column-break-inside: avoid; }
            .label img { width: 100%; height: auto; display: block; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .meta { font-size: 10px; margin-top: 4px; color: #111; }
            @media print { body { margin: 0; } }
          </style>
          <script>
            (function(){
              function triggerPrint(){ try{ window.focus(); }catch(e){} setTimeout(function(){ window.print(); }, 50); }
              function waitForImagesAndPrint(){
                var images = Array.prototype.slice.call(document.images);
                var pending = images.length;
                if(pending === 0){ triggerPrint(); return; }
                var done = false;
                var finish = function(){ if(done) return; done = true; triggerPrint(); };
                var timer = setTimeout(finish, 1500);
                images.forEach(function(img){
                  if(img.complete && img.naturalWidth > 0){ pending--; if(pending === 0){ clearTimeout(timer); finish(); } }
                  else {
                    img.addEventListener('load', function(){ pending--; if(pending === 0){ clearTimeout(timer); finish(); } });
                    img.addEventListener('error', function(){ pending--; if(pending === 0){ clearTimeout(timer); finish(); } });
                  }
                });
              }
              window.addEventListener('load', waitForImagesAndPrint);
              window.addEventListener('afterprint', function(){ window.close(); });
            })();
          </script>
        </head>
        <body>
          ${labels}
        </body>
      </html>
    `);

    printWindow.document.close();
    try { printWindow.focus(); } catch {}

    toast.success(`تم تجهيز ${items.length} باركود للطباعة`);
    setSelectedProducts(new Set());
  };

  const printAllBarcodes = () => {
    const items = filteredProducts
      .map(p => ({ name: p.name, value: p.barcode || '' }))
      .filter(i => i.value);

    if (items.length === 0) {
      toast.error('لا توجد باركودات للطباعة');
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('لا يمكن فتح نافذة الطباعة');
      return;
    }

    const storeName = storeSettings?.name || '';

    const generateDataURL = (value: string) => {
      const canvas = document.createElement('canvas');
      try {
        JsBarcode(canvas, value, {
          format: 'CODE128',
          width: 2,
          height: 60,
          displayValue: false,
          background: '#ffffff',
          lineColor: '#000000',
          margin: 0
        });
        return canvas.toDataURL('image/png');
      } catch {
        return '';
      }
    };

    const labels = items.map(i => {
      const url = generateDataURL(i.value);
      return url ? `
        <div class="label">
          <img src="${url}" alt="${i.name}" />
          <div class="meta">${i.name}${storeName ? ' — ' + storeName : ''}</div>
        </div>
      ` : '';
    }).join('');

    printWindow.document.write(`
      <html dir="rtl" lang="ar">
        <head>
          <meta charSet="UTF-8" />
          <title>طباعة جميع الباركود</title>
          <style>
            @page { size: 25mm auto; margin: 0; }
            html, body { margin: 0; padding: 6px; font-family: Arial, sans-serif; }
            .label { width: 25mm; max-width: 25mm; padding: 4px 0; text-align: center; page-break-inside: avoid; break-inside: avoid; -webkit-column-break-inside: avoid; }
            .label img { width: 100%; height: auto; display: block; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .meta { font-size: 10px; margin-top: 4px; color: #111; }
            @media print { body { margin: 0; } }
          </style>
          <script>
            (function(){
              function triggerPrint(){ try{ window.focus(); }catch(e){} setTimeout(function(){ window.print(); }, 50); }
              function waitForImagesAndPrint(){
                var images = Array.prototype.slice.call(document.images);
                var pending = images.length;
                if(pending === 0){ triggerPrint(); return; }
                var done = false;
                var finish = function(){ if(done) return; done = true; triggerPrint(); };
                var timer = setTimeout(finish, 1500);
                images.forEach(function(img){
                  if(img.complete && img.naturalWidth > 0){ pending--; if(pending === 0){ clearTimeout(timer); finish(); } }
                  else {
                    img.addEventListener('load', function(){ pending--; if(pending === 0){ clearTimeout(timer); finish(); } });
                    img.addEventListener('error', function(){ pending--; if(pending === 0){ clearTimeout(timer); finish(); } });
                  }
                });
              }
              window.addEventListener('load', waitForImagesAndPrint);
              window.addEventListener('afterprint', function(){ window.close(); });
            })();
          </script>
        </head>
        <body>
          ${labels}
        </body>
      </html>
    `);

    printWindow.document.close();
    try { printWindow.focus(); } catch {}

    toast.success(`تم تجهيز ${items.length} باركود للطباعة`);
  };

  return (
    <MainLayout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">إدارة الباركود</h1>
        </div>

        <Tabs defaultValue="products" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="products">المنتجات والباركود</TabsTrigger>
          </TabsList>

          <TabsContent value="products" className="space-y-4">
            {/* Search and Controls */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="h-5 w-5" />
                  البحث والتحكم
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4 items-center">
                  <div className="flex-1">
                    <Input
                      placeholder="البحث بالاسم أو الباركود..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <Button 
                    onClick={printSelectedBarcodes}
                    disabled={selectedProducts.size === 0}
                    variant="default"
                  >
                    <Printer className="h-4 w-4 mr-2" />
                    طباعة المحدد ({selectedProducts.size})
                  </Button>
                  <Button 
                    onClick={printAllBarcodes}
                    variant="outline"
                  >
                    <Printer className="h-4 w-4 mr-2" />
                    طباعة الكل ({filteredProducts.length})
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Products Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <Card key={i} className="animate-pulse">
                    <CardContent className="p-4">
                      <div className="h-4 bg-gray-200 rounded mb-2"></div>
                      <div className="h-3 bg-gray-200 rounded w-2/3 mb-4"></div>
                      <div className="h-20 bg-gray-200 rounded"></div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                filteredProducts.map((product) => (
                  <Card 
                    key={product.id} 
                    className={`cursor-pointer transition-all ${
                      selectedProducts.has(product.id) 
                        ? 'ring-2 ring-primary bg-primary/5' 
                        : 'hover:shadow-md'
                    }`}
                    onClick={() => toggleProductSelection(product.id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h3 className="font-semibold text-sm line-clamp-2">{product.name}</h3>
                          {product.companies?.name && (
                            <Badge variant="secondary" className="text-xs mt-1">
                              {product.companies.name}
                            </Badge>
                          )}
                        </div>
                        <input
                          type="checkbox"
                          checked={selectedProducts.has(product.id)}
                          onChange={() => toggleProductSelection(product.id)}
                          className="mr-2"
                        />
                      </div>

                      {editingProduct === product.id ? (
                        <div className="space-y-3">
                          <div className="space-y-2">
                            <label className="text-xs font-medium">باركود القطعة</label>
                            <Input
                              value={editingBarcode.barcode}
                              onChange={(e) => setEditingBarcode(prev => ({ ...prev, barcode: e.target.value }))}
                              placeholder="أدخل باركود القطعة"
                              className="text-xs"
                            />
                          </div>
                          {product.bulk_enabled && (
                            <div className="space-y-2">
                              <label className="text-xs font-medium">باركود الجملة</label>
                              <Input
                                value={editingBarcode.bulk_barcode}
                                onChange={(e) => setEditingBarcode(prev => ({ ...prev, bulk_barcode: e.target.value }))}
                                placeholder="أدخل باركود الجملة"
                                className="text-xs"
                              />
                            </div>
                          )}
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => saveBarcode(product.id)}>
                              <Save className="h-3 w-3 mr-1" />
                              حفظ
                            </Button>
                            <Button size="sm" variant="outline" onClick={cancelEditing}>
                              <X className="h-3 w-3 mr-1" />
                              إلغاء
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {/* Edit Button */}
                          <div className="flex justify-end">
                            <Button 
                              size="sm" 
                              variant="outline" 
                              onClick={(e) => {
                                e.stopPropagation();
                                startEditing(product);
                              }}
                            >
                              <Edit className="h-3 w-3 mr-1" />
                              تعديل
                            </Button>
                          </div>

                          {/* Regular Barcode */}
                          {product.barcode && (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-primary">قطعة</span>
                              </div>
                              <SimpleBarcodeDisplay 
                                value={product.barcode}
                                productName={product.name}
                                storeName={storeSettings?.name || 'المتجر'}
                                className="h-12 w-full"
                              />
                              <p className="text-xs text-center font-mono">{product.barcode}</p>
                            </div>
                          )}

                          {/* Bulk Barcode */}
                          {product.bulk_enabled && product.bulk_barcode && (
                            <div className="space-y-2 pt-2 border-t">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-green-600">جملة</span>
                              </div>
                              <SimpleBarcodeDisplay 
                                value={product.bulk_barcode}
                                productName={`${product.name} (جملة)`}
                                storeName={storeSettings?.name || 'المتجر'}
                                className="h-12 w-full"
                              />
                              <p className="text-xs text-center font-mono">{product.bulk_barcode}</p>
                            </div>
                          )}

                          {/* No Barcode */}
                          {!product.barcode && !product.bulk_barcode && (
                            <div className="text-center py-4 text-muted-foreground text-sm">
                              لا يوجد باركود لهذا المنتج
                              <br />
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="mt-2"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startEditing(product);
                                }}
                              >
                                إضافة باركود
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>

            {!loading && filteredProducts.length === 0 && (
              <Card>
                <CardContent className="p-8 text-center">
                  <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">لا توجد منتجات تطابق البحث</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

        </Tabs>
      </div>
    </MainLayout>
  );
}