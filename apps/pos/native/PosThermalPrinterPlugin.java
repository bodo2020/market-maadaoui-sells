package com.elmadawy.pos;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.text.Layout;
import android.text.StaticLayout;
import android.text.TextDirectionHeuristics;
import android.text.TextPaint;
import android.util.Base64;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.OutputStream;
import java.io.IOException;
import java.util.Set;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(name = "PosThermalPrinter", permissions = {
    @Permission(alias = "bluetooth", strings = { Manifest.permission.BLUETOOTH_CONNECT })
})
public class PosThermalPrinterPlugin extends Plugin {
    private static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final ScheduledExecutorService deadlines = Executors.newSingleThreadScheduledExecutor();
    private final AtomicBoolean printing = new AtomicBoolean(false);
    private final AtomicBoolean testing = new AtomicBoolean(false);
    private BluetoothSocket persistentSocket;
    private OutputStream persistentOutput;
    private String persistentAddress;

    private BluetoothAdapter adapter() {
        BluetoothManager manager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        return manager == null ? null : manager.getAdapter();
    }

    private boolean authorized(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 31 && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
            requestPermissionForAlias("bluetooth", call, "permissionResult");
            return false;
        }
        return true;
    }

    @PermissionCallback
    private void permissionResult(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 31 && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
            call.reject("اسمح باتصال Bluetooth لاختيار الطابعة");
            return;
        }
        String operation = call.getString("operation", "");
        if ("list".equals(operation)) listPaired(call);
        else if ("save".equals(operation)) select(call);
        else if ("print".equals(operation)) printHtml(call);
        else if ("printReceipt".equals(operation)) printReceipt(call);
        else if ("test".equals(operation)) testConnection(call);
        else call.reject("عملية غير معروفة");
    }

    @PluginMethod
    public void getSelected(PluginCall call) {
        JSObject result = new JSObject();
        result.put("address", getContext().getSharedPreferences("thermal_printer", Context.MODE_PRIVATE).getString("address", null));
        result.put("name", getContext().getSharedPreferences("thermal_printer", Context.MODE_PRIVATE).getString("name", null));
        result.put("paperSize", getContext().getSharedPreferences("thermal_printer", Context.MODE_PRIVATE).getString("paperSize", "80mm"));
        call.resolve(result);
    }

    @PluginMethod
    public void listPaired(PluginCall call) {
        if (!authorized(call)) return;
        try {
            BluetoothAdapter bluetooth = adapter();
            if (bluetooth == null || !bluetooth.isEnabled()) { call.reject("فعّل Bluetooth من إعدادات أندرويد أولًا"); return; }
            JSArray devices = new JSArray();
            for (BluetoothDevice device : bluetooth.getBondedDevices()) {
                JSObject item = new JSObject();
                item.put("address", device.getAddress());
                item.put("name", device.getName() == null ? device.getAddress() : device.getName());
                devices.put(item);
            }
            JSObject result = new JSObject();
            result.put("devices", devices);
            call.resolve(result);
        } catch (SecurityException error) { call.reject("لا توجد صلاحية للوصول إلى طابعات Bluetooth", error); }
    }

    @PluginMethod
    public void select(PluginCall call) {
        if (!authorized(call)) return;
        String address = call.getString("address", "");
        String paperSize = call.getString("paperSize", "80mm");
        if (!"58mm".equals(paperSize) && !"80mm".equals(paperSize)) { call.reject("مقاس الورق غير صالح"); return; }
        try {
            BluetoothAdapter bluetooth = adapter();
            if (bluetooth == null || !bluetooth.isEnabled()) { call.reject("فعّل Bluetooth أولًا"); return; }
            BluetoothDevice selected = null;
            for (BluetoothDevice device : bluetooth.getBondedDevices()) if (device.getAddress().equals(address)) selected = device;
            if (selected == null) { call.reject("اقرن الطابعة من إعدادات Bluetooth أولًا"); return; }
            String name = selected.getName() == null ? address : selected.getName();
            String oldAddress = getContext().getSharedPreferences("thermal_printer", Context.MODE_PRIVATE).getString("address", null);
            if (oldAddress != null && !oldAddress.equals(address)) closePersistentConnection();
            getContext().getSharedPreferences("thermal_printer", Context.MODE_PRIVATE).edit()
                .putString("address", address).putString("name", name).putString("paperSize", paperSize).apply();
            getSelected(call);
        } catch (SecurityException error) { call.reject("لا توجد صلاحية لاتصال Bluetooth", error); }
    }

    @PluginMethod
    public void clear(PluginCall call) {
        closePersistentConnection();
        getContext().getSharedPreferences("thermal_printer", Context.MODE_PRIVATE).edit().clear().apply();
        call.resolve();
    }

    @PluginMethod
    public void testConnection(PluginCall call) {
        if (!authorized(call)) return;
        if (printing.get() || !testing.compareAndSet(false, true)) { call.reject("انتظر انتهاء الطباعة الحالية قبل الاختبار"); return; }
        String address = getContext().getSharedPreferences("thermal_printer", Context.MODE_PRIVATE).getString("address", null);
        if (address == null) { testing.set(false); call.reject("اختار الطابعة أولًا"); return; }
        worker.execute(() -> {
            try {
                OutputStream output = getPersistentOutput(address);
                output.write(new byte[] {27, 64});
                output.write("ELMADAWY POS - TEST\n\n".getBytes(java.nio.charset.StandardCharsets.US_ASCII));
                output.flush();
                JSObject result = new JSObject();
                result.put("sent", true);
                result.put("persistent", true);
                call.resolve(result);
            } catch (Exception error) {
                closePersistentConnection();
                call.reject("فشل اختبار اتصال الطابعة: " + error.getMessage(), error);
            } finally { testing.set(false); }
        });
    }


    @PluginMethod
    public void printReceipt(PluginCall call) {
        if (!authorized(call)) return;
        String address = getContext().getSharedPreferences("thermal_printer", Context.MODE_PRIVATE).getString("address", null);
        if (address == null) { call.reject("اختار طابعة حرارية أولًا"); return; }
        JSObject receipt = call.getObject("receipt");
        if (receipt == null) { call.reject("بيانات الفاتورة غير صالحة"); return; }
        if (testing.get() || !printing.compareAndSet(false, true)) { call.reject("هناك فاتورة قيد الطباعة؛ انتظر انتهاءها أو حاول بعد قليل"); return; }

        int width = "58mm".equals(getContext().getSharedPreferences("thermal_printer", Context.MODE_PRIVATE).getString("paperSize", "80mm")) ? 384 : 576;
        worker.execute(() -> {
            Bitmap bitmap = null;
            long started = System.currentTimeMillis();
            try {
                bitmap = renderNativeReceipt(receipt, width);
                long prepared = System.currentTimeMillis();
                sendBitmap(address, bitmap);
                long completed = System.currentTimeMillis();
                JSObject result = new JSObject();
                result.put("printed", true);
                result.put("mode", "android_native_bitmap");
                result.put("prepareMs", prepared - started);
                result.put("sendMs", completed - prepared);
                result.put("totalMs", completed - started);
                result.put("persistentConnection", true);
                call.resolve(result);
            } catch (Exception error) {
                call.reject("تعذر طباعة الفاتورة السريعة: " + error.getMessage(), error);
            } finally {
                if (bitmap != null) bitmap.recycle();
                printing.set(false);
            }
        });
    }

    @PluginMethod
    public void printHtml(PluginCall call) {
        if (!authorized(call)) return;
        String html = call.getString("html", "");
        String address = getContext().getSharedPreferences("thermal_printer", Context.MODE_PRIVATE).getString("address", null);
        if (address == null) { call.reject("اختار طابعة حرارية أولًا"); return; }
        if (html.length() < 20 || html.length() > 750_000) { call.reject("محتوى الفاتورة غير صالح"); return; }
        if (testing.get() || !printing.compareAndSet(false, true)) { call.reject("هناك فاتورة قيد الطباعة؛ انتظر انتهاءها أو حاول بعد قليل"); return; }
        int width = "58mm".equals(getContext().getSharedPreferences("thermal_printer", Context.MODE_PRIVATE).getString("paperSize", "80mm")) ? 384 : 576;
        Handler main = new Handler(Looper.getMainLooper());
        AtomicBoolean preparing = new AtomicBoolean(true);
        WebView[] currentView = new WebView[1];
        Runnable timeout = () -> {
            if (!preparing.compareAndSet(true, false)) return;
            printing.set(false);
            if (currentView[0] != null) currentView[0].destroy();
            call.reject("انتهت مهلة تجهيز الفاتورة للطباعة؛ حاول مرة أخرى");
        };
        main.postDelayed(timeout, 12000);
        getActivity().runOnUiThread(() -> {
          try {
            WebView view = new WebView(getActivity());
            currentView[0] = view;
            view.setLayerType(WebView.LAYER_TYPE_SOFTWARE, null);
            view.setBackgroundColor(0xffffffff);
            view.getSettings().setJavaScriptEnabled(true);
            view.getSettings().setLoadsImagesAutomatically(true);
            // Keep the temporary viewport tiny. A tall detached WebView makes scrollHeight include
            // blank viewport space and causes the printer to feed unnecessary paper.
            final int previewHeight = 96;
            view.measure(android.view.View.MeasureSpec.makeMeasureSpec(width, android.view.View.MeasureSpec.EXACTLY), android.view.View.MeasureSpec.makeMeasureSpec(previewHeight, android.view.View.MeasureSpec.EXACTLY));
            view.layout(0, 0, width, previewHeight);
            view.setWebViewClient(new WebViewClient() {
                boolean started;
                @Override public void onPageFinished(WebView loaded, String url) {
                    if (started || !preparing.get()) return;
                    started = true;
                    main.postDelayed(() -> {
                      if (!preparing.get()) return;
                      loaded.evaluateJavascript(
                        "(()=>{const r=document.querySelectorAll('.receipt');const last=r.length?r[r.length-1]:document.body;const rect=last.getBoundingClientRect();return Math.ceil(Math.max(1,rect.bottom)*(window.devicePixelRatio||1));})()",
                        raw -> {
                        try {
                            if (!preparing.get()) return;
                            int height = (int) Math.ceil(Double.parseDouble(raw.replace("\"", "")));
                            if (height <= 0 || height > 20000) throw new IllegalArgumentException("طول الفاتورة أكبر من حد الطابعة");
                            loaded.measure(android.view.View.MeasureSpec.makeMeasureSpec(width, android.view.View.MeasureSpec.EXACTLY), android.view.View.MeasureSpec.makeMeasureSpec(height, android.view.View.MeasureSpec.EXACTLY));
                            loaded.layout(0, 0, width, height);
                            Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.RGB_565);
                            bitmap.eraseColor(0xffffffff);
                            loaded.draw(new Canvas(bitmap));
                            if (!preparing.compareAndSet(true, false)) { bitmap.recycle(); return; }
                            main.removeCallbacks(timeout);
                            worker.execute(() -> {
                                try {
                                    sendBitmap(address, bitmap);
                                    JSObject result = new JSObject(); result.put("printed", true); call.resolve(result);
                } catch (Exception error) { call.reject("تعذر إرسال الفاتورة للطابعة: " + error.getMessage(), error); }
                                finally { bitmap.recycle(); printing.set(false); getActivity().runOnUiThread(loaded::destroy); }
                            });
                        } catch (Exception error) {
                            if (preparing.compareAndSet(true, false)) {
                                main.removeCallbacks(timeout);
                                printing.set(false); loaded.destroy(); call.reject("تعذر تجهيز الفاتورة الحرارية: " + error.getMessage(), error);
                            }
                        }
                      });
                    }, 450);
                }
            });
            // The receipt layout itself is rendered to pixels, so Arabic and logos work without printer code pages.
            String override = "<style>" +
                "html,body{width:100%!important;overflow:visible!important}" +
                ".receipt{width:100%!important;max-width:100%!important;margin:0!important}" +
                ".paper-80{padding:1.8mm 2.2mm 2.2mm!important;font-size:8.3px!important;line-height:1.22!important}" +
                ".paper-58{padding:1.6mm 1.8mm 2mm!important;font-size:7.7px!important;line-height:1.22!important}" +
                ".paper-80 h1{font-size:14.5px!important}.paper-58 h1{font-size:12.5px!important}" +
                ".paper-80 .tagline{font-size:7.8px!important}.paper-58 .tagline{font-size:7px!important}" +
                ".paper-80 .store-lines{font-size:7.2px!important}.paper-58 .store-lines{font-size:6.7px!important}" +
                ".paper-80 .invoice-number{font-size:11.5px!important}.paper-58 .invoice-number{font-size:10px!important}" +
                ".paper-80 .meta-block span{font-size:6.8px!important}.paper-80 .meta-block strong{font-size:7.7px!important}" +
                ".paper-58 .meta-block span{font-size:6.3px!important}.paper-58 .meta-block strong{font-size:7.2px!important}" +
                ".items-80 th{font-size:6.9px!important;padding:3px 1px!important}.items-80 td{font-size:7.4px!important;padding:3px 1px!important}" +
                ".items-80 .product strong{font-size:7.6px!important}.items-80 .product small{font-size:6px!important}" +
                ".paper-80 .totals>div{font-size:8.2px!important}.paper-80 .grand-total{font-size:10.5px!important}.paper-80 .grand-total strong{font-size:11.5px!important}" +
                ".paper-58 .grand-total{font-size:9.8px!important}.paper-58 .grand-total strong{font-size:10.5px!important}" +
                ".paper-80 .payment-block>div{font-size:7.7px!important}.paper-58 .payment-block>div{font-size:7px!important}" +
                ".receipt-head{padding-bottom:3px!important}.invoice-identity{padding:4px 0 3px!important}.meta-block{padding:3px 0!important;row-gap:2px!important}" +
                ".totals{margin-top:3px!important;padding-top:3px!important}.payment-block{margin-top:3px!important;padding:3px 0!important}" +
                ".invoice-barcode{margin-top:4px!important}.footer{margin-top:4px!important;padding-top:3px!important}" +
                ".paper-80 .footer strong{font-size:8.5px!important}.paper-58 .footer strong{font-size:8px!important}" +
                "</style></head>";
            view.loadDataWithBaseURL("https://localhost/", html.replace("</head>", override), "text/html", "UTF-8", null);
          } catch (Exception error) {
            if (preparing.compareAndSet(true, false)) {
              main.removeCallbacks(timeout); printing.set(false);
              if (currentView[0] != null) currentView[0].destroy();
              call.reject("تعذر فتح معاينة الفاتورة: " + error.getMessage(), error);
            }
          }
        });
    }


    private Bitmap renderNativeReceipt(JSObject receipt, int width) throws Exception {
        int margin = width >= 500 ? 24 : 16;
        JSONArray items = receipt.optJSONArray("items");
        int itemCount = items == null ? 0 : items.length();
        int maxHeight = Math.min(18000, Math.max(1200, 820 + itemCount * (width >= 500 ? 115 : 135)));
        Bitmap working = Bitmap.createBitmap(width, maxHeight, Bitmap.Config.RGB_565);
        working.eraseColor(Color.WHITE);
        Canvas canvas = new Canvas(working);
        TextPaint paint = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(Color.BLACK);
        int contentWidth = width - margin * 2;
        int y = width >= 500 ? 18 : 14;

        y += drawTextBlock(canvas, receipt.optString("storeName", "المعداوي ماركت"), paint, margin, y, contentWidth, width >= 500 ? 30f : 25f, true, Layout.Alignment.ALIGN_CENTER, true);
        String tagline = receipt.optString("tagline", "مش مجرد ماركت");
        if (!tagline.isEmpty()) y += drawTextBlock(canvas, tagline, paint, margin, y + 1, contentWidth, width >= 500 ? 17f : 15f, true, Layout.Alignment.ALIGN_CENTER, true) + 1;
        String address = receipt.optString("address", "");
        if (!address.isEmpty()) y += drawTextBlock(canvas, address, paint, margin, y, contentWidth, width >= 500 ? 15f : 13f, false, Layout.Alignment.ALIGN_CENTER, true);
        String phone = receipt.optString("phone", "");
        if (!phone.isEmpty()) y += drawTextBlock(canvas, "هاتف: " + phone, paint, margin, y, contentWidth, width >= 500 ? 15f : 13f, false, Layout.Alignment.ALIGN_CENTER, true);
        y += 8;
        drawSeparator(canvas, margin, y, width - margin, false); y += 10;

        y += drawTextBlock(canvas, "فاتورة مبيعات", paint, margin, y, contentWidth, width >= 500 ? 17f : 15f, true, Layout.Alignment.ALIGN_CENTER, true);
        y += drawTextBlock(canvas, "#" + receipt.optString("invoiceNumber", ""), paint, margin, y, contentWidth, width >= 500 ? 24f : 20f, true, Layout.Alignment.ALIGN_CENTER, false);
        y += drawTextBlock(canvas, "مدفوعة", paint, margin, y + 2, contentWidth, width >= 500 ? 15f : 13f, true, Layout.Alignment.ALIGN_CENTER, true) + 5;
        drawSeparator(canvas, margin, y, width - margin, true); y += 10;

        y += drawTextBlock(canvas,
            "التاريخ: " + receipt.optString("dateLabel", "") + "    الوقت: " + receipt.optString("timeLabel", ""),
            paint, margin, y, contentWidth, width >= 500 ? 15f : 13f, false, Layout.Alignment.ALIGN_NORMAL, true);
        y += drawTextBlock(canvas,
            "الكاشير: " + receipt.optString("cashier", "—") + "    الدفع: " + receipt.optString("payment", "—"),
            paint, margin, y + 1, contentWidth, width >= 500 ? 15f : 13f, true, Layout.Alignment.ALIGN_NORMAL, true) + 4;

        String customer = receipt.optString("customer", "");
        if (!customer.isEmpty()) {
            drawSeparator(canvas, margin, y, width - margin, true); y += 8;
            y += drawTextBlock(canvas, "العميل: " + customer, paint, margin, y, contentWidth, width >= 500 ? 15f : 13f, false, Layout.Alignment.ALIGN_NORMAL, true);
        }
        y += 3;
        drawSeparator(canvas, margin, y, width - margin, false); y += 10;

        y += drawTextBlock(canvas, "الأصناف", paint, margin, y, contentWidth, width >= 500 ? 16f : 14f, true, Layout.Alignment.ALIGN_CENTER, true) + 2;
        if (items != null) {
            for (int i = 0; i < items.length(); i++) {
                JSONObject item = items.optJSONObject(i);
                if (item == null) continue;
                y += drawTextBlock(canvas, item.optString("name", "صنف"), paint, margin, y, contentWidth, width >= 500 ? 17f : 15f, true, Layout.Alignment.ALIGN_NORMAL, true);
                String calc = item.optString("quantity", "") + " × " + item.optString("price", "") + "    =    " + item.optString("total", "");
                y += drawTextBlock(canvas, calc, paint, margin, y + 1, contentWidth, width >= 500 ? 14f : 12f, false, Layout.Alignment.ALIGN_NORMAL, true);
                String productBarcode = item.optString("barcode", "");
                if (!productBarcode.isEmpty()) y += drawTextBlock(canvas, productBarcode, paint, margin, y, contentWidth, width >= 500 ? 12f : 11f, false, Layout.Alignment.ALIGN_NORMAL, false);
                y += 3;
                drawSeparator(canvas, margin, y, width - margin, true); y += 7;
                if (y > maxHeight - 500) throw new IllegalArgumentException("الفاتورة طويلة جدًا للطباعة السريعة");
            }
        }

        y += 3;
        y += drawKeyValue(canvas, paint, margin, y, contentWidth, "المجموع الفرعي", receipt.optString("subtotal", ""), width >= 500 ? 16f : 14f, false);
        String discount = receipt.optString("discount", "");
        if (!discount.isEmpty()) y += drawKeyValue(canvas, paint, margin, y, contentWidth, "الخصومات", discount, width >= 500 ? 15f : 13f, false);
        String loyalty = receipt.optString("loyalty", "");
        if (!loyalty.isEmpty()) y += drawKeyValue(canvas, paint, margin, y, contentWidth, "كوبون / ولاء", loyalty, width >= 500 ? 15f : 13f, false);
        String fee = receipt.optString("fee", "");
        if (!fee.isEmpty()) y += drawKeyValue(canvas, paint, margin, y, contentWidth, "رسوم الدفع", fee, width >= 500 ? 15f : 13f, false);
        y += 4;
        drawSeparator(canvas, margin, y, width - margin, false); y += 8;
        y += drawKeyValue(canvas, paint, margin, y, contentWidth, "المدفوع فعليًا", receipt.optString("total", ""), width >= 500 ? 23f : 20f, true);
        y += 4;
        drawSeparator(canvas, margin, y, width - margin, false); y += 10;
        y += drawKeyValue(canvas, paint, margin, y, contentWidth, "طريقة الدفع", receipt.optString("payment", ""), width >= 500 ? 15f : 13f, true);

        String barcodeDataUrl = receipt.optString("barcodeDataUrl", "");
        Bitmap barcode = decodeDataUrl(barcodeDataUrl);
        if (barcode != null) {
            y += 8;
            int targetWidth = Math.min(contentWidth, (int) (contentWidth * 0.82f));
            int targetHeight = Math.max(48, Math.min(width >= 500 ? 90 : 76, Math.round(barcode.getHeight() * (targetWidth / (float) barcode.getWidth()))));
            android.graphics.Rect src = new android.graphics.Rect(0, 0, barcode.getWidth(), barcode.getHeight());
            android.graphics.Rect dst = new android.graphics.Rect((width - targetWidth) / 2, y, (width + targetWidth) / 2, y + targetHeight);
            canvas.drawBitmap(barcode, src, dst, null);
            y += targetHeight + 6;
            barcode.recycle();
        }

        drawSeparator(canvas, margin, y, width - margin, false); y += 9;
        y += drawTextBlock(canvas, receipt.optString("footer", "شكرًا لزيارتكم"), paint, margin, y, contentWidth, width >= 500 ? 19f : 16f, true, Layout.Alignment.ALIGN_CENTER, true);
        y += drawTextBlock(canvas, "احتفظ بالفاتورة للرجوع إليها عند الحاجة", paint, margin, y + 1, contentWidth, width >= 500 ? 13f : 11f, false, Layout.Alignment.ALIGN_CENTER, true);
        y += width >= 500 ? 16 : 12;

        int finalHeight = Math.min(maxHeight, Math.max(1, y));
        Bitmap result = Bitmap.createBitmap(working, 0, 0, width, finalHeight);
        working.recycle();
        return result;
    }

    private int drawTextBlock(Canvas canvas, String text, TextPaint paint, int x, int y, int width, float size, boolean bold, Layout.Alignment alignment, boolean rtl) {
        if (text == null || text.trim().isEmpty()) return 0;
        paint.setTextSize(size);
        paint.setTypeface(Typeface.create("sans-serif", bold ? Typeface.BOLD : Typeface.NORMAL));
        StaticLayout layout = StaticLayout.Builder.obtain(text, 0, text.length(), paint, width)
            .setAlignment(alignment)
            .setIncludePad(false)
            .setTextDirection(rtl ? TextDirectionHeuristics.FIRSTSTRONG_RTL : TextDirectionHeuristics.FIRSTSTRONG_LTR)
            .setLineSpacing(0f, 1.0f)
            .build();
        canvas.save();
        canvas.translate(x, y);
        layout.draw(canvas);
        canvas.restore();
        return layout.getHeight() + 3;
    }

    private int drawKeyValue(Canvas canvas, TextPaint paint, int x, int y, int width, String label, String value, float size, boolean bold) {
        int gap = 8;
        int half = (width - gap) / 2;
        int rightHeight = drawTextBlock(canvas, label, paint, x + half + gap, y, half, size, bold, Layout.Alignment.ALIGN_NORMAL, true);
        int leftHeight = drawTextBlock(canvas, value, paint, x, y, half, size, bold, Layout.Alignment.ALIGN_OPPOSITE, true);
        return Math.max(rightHeight, leftHeight);
    }

    private void drawSeparator(Canvas canvas, int left, int y, int right, boolean dashed) {
        Paint line = new Paint(Paint.ANTI_ALIAS_FLAG);
        line.setColor(Color.BLACK);
        line.setStrokeWidth(dashed ? 1f : 2f);
        if (!dashed) {
            canvas.drawLine(left, y, right, y, line);
            return;
        }
        for (int x = left; x < right; x += 10) canvas.drawLine(x, y, Math.min(x + 5, right), y, line);
    }

    private Bitmap decodeDataUrl(String dataUrl) {
        try {
            if (dataUrl == null || dataUrl.isEmpty()) return null;
            int comma = dataUrl.indexOf(',');
            String encoded = comma >= 0 ? dataUrl.substring(comma + 1) : dataUrl;
            byte[] bytes = Base64.decode(encoded, Base64.DEFAULT);
            return BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        } catch (Exception ignored) {
            return null;
        }
    }

    private synchronized void closePersistentConnection() {
        if (persistentOutput != null) {
            try { persistentOutput.flush(); } catch (Exception ignored) { }
        }
        if (persistentSocket != null) {
            try { persistentSocket.close(); } catch (Exception ignored) { }
        }
        persistentSocket = null;
        persistentOutput = null;
        persistentAddress = null;
    }

    private synchronized OutputStream getPersistentOutput(String address) throws Exception {
        if (persistentSocket != null && persistentSocket.isConnected() && address.equals(persistentAddress) && persistentOutput != null) {
            return persistentOutput;
        }
        closePersistentConnection();
        persistentSocket = connectPrinter(address);
        persistentOutput = persistentSocket.getOutputStream();
        persistentAddress = address;
        return persistentOutput;
    }

    private void sendBitmap(String address, Bitmap bitmap) throws Exception {
        OutputStream out = getPersistentOutput(address);
        try {
            out.write(new byte[] {27, 64});
            int width = bitmap.getWidth();
            int rowBytes = (width + 7) / 8;
            // XP-P323B has a substantially larger printer buffer than generic portable units.
            // Use a dedicated fast profile for it, while keeping conservative pacing for unknown models.
            String printerName = getContext().getSharedPreferences("thermal_printer", Context.MODE_PRIVATE).getString("name", "");
            boolean xpP323bFast = printerName != null && printerName.toUpperCase(java.util.Locale.ROOT).contains("XP-P323B");
            final int bandHeight = xpP323bFast ? 128 : 48;
            final int bandDelayMs = xpP323bFast ? 0 : 8;
            int[] pixels = new int[width * bandHeight];
            for (int top = 0; top < bitmap.getHeight(); top += bandHeight) {
                int rows = Math.min(bandHeight, bitmap.getHeight() - top);
                byte[] raster = new byte[8 + rowBytes * rows];
                raster[0] = 29; raster[1] = 118; raster[2] = 48; raster[3] = 0;
                raster[4] = (byte) rowBytes; raster[5] = (byte) (rowBytes >> 8);
                raster[6] = (byte) rows; raster[7] = (byte) (rows >> 8);
                bitmap.getPixels(pixels, 0, width, 0, top, width, rows);
                for (int y = 0; y < rows; y++) for (int x = 0; x < width; x++) {
                    int color = pixels[y * width + x];
                    int luminance = ((color >> 16 & 255) * 299 + (color >> 8 & 255) * 587 + (color & 255) * 114) / 1000;
                    if (luminance < 180) raster[8 + y * rowBytes + x / 8] |= (byte) (0x80 >> (x % 8));
                }
                try { out.write(raster); }
                catch (IOException error) { throw new IOException("انقطع الاتصال أثناء إرسال الفاتورة بعد " + top + " سطر", error); }
                if (bandDelayMs > 0) Thread.sleep(bandDelayMs);
            }
            // ESC/POS feed one line: predictable tear margin without extra blank paper.
            out.write(new byte[] {27, 100, 1});
            out.flush();
        } catch (Exception error) {
            closePersistentConnection();
            throw error;
        }
    }

    private BluetoothSocket connectPrinter(String address) throws Exception {
        BluetoothAdapter bluetooth = adapter();
        if (bluetooth == null || !bluetooth.isEnabled()) throw new IllegalStateException("Bluetooth مغلق");
        BluetoothDevice device = null;
        Set<BluetoothDevice> bonded = bluetooth.getBondedDevices();
        for (BluetoothDevice item : bonded) if (item.getAddress().equals(address)) device = item;
        if (device == null) throw new IllegalStateException("الطابعة لم تعد مقترنة بالجهاز");
        if (Build.VERSION.SDK_INT >= 31 && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED) bluetooth.cancelDiscovery();
        IOException secureError;
        BluetoothSocket secure = device.createRfcommSocketToServiceRecord(SPP);
        try { connectWithDeadline(secure); return secure; }
        catch (IOException error) {
            secureError = error;
            try { secure.close(); } catch (IOException ignored) { }
        }
        // Paired receipt printers without authenticated SPP pairing may only accept this socket.
        BluetoothSocket fallback = device.createInsecureRfcommSocketToServiceRecord(SPP);
        try { connectWithDeadline(fallback); return fallback; }
        catch (IOException error) {
            try { fallback.close(); } catch (IOException ignored) { }
            throw new IOException("لم يقبل منفذ الطابعة الاتصال؛ تأكد من تشغيلها واقترانها (" + secureError.getMessage() + ")", error);
        }
    }

    private void connectWithDeadline(BluetoothSocket socket) throws IOException {
        ScheduledFuture<?> timeout = deadlines.schedule(() -> {
            try { socket.close(); } catch (IOException ignored) { }
        }, 10, TimeUnit.SECONDS);
        try { socket.connect(); }
        finally { timeout.cancel(false); }
    }
}
