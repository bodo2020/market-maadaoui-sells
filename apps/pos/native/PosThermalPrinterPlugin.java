package com.elmadawy.pos;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.os.Build;
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
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(name = "PosThermalPrinter", permissions = {
    @Permission(alias = "bluetooth", strings = { Manifest.permission.BLUETOOTH_CONNECT })
})
public class PosThermalPrinterPlugin extends Plugin {
    private static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final AtomicBoolean printing = new AtomicBoolean(false);

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
            getContext().getSharedPreferences("thermal_printer", Context.MODE_PRIVATE).edit()
                .putString("address", address).putString("name", name).putString("paperSize", paperSize).apply();
            getSelected(call);
        } catch (SecurityException error) { call.reject("لا توجد صلاحية لاتصال Bluetooth", error); }
    }

    @PluginMethod
    public void clear(PluginCall call) {
        getContext().getSharedPreferences("thermal_printer", Context.MODE_PRIVATE).edit().clear().apply();
        call.resolve();
    }

    @PluginMethod
    public void printHtml(PluginCall call) {
        if (!authorized(call)) return;
        String html = call.getString("html", "");
        String address = getContext().getSharedPreferences("thermal_printer", Context.MODE_PRIVATE).getString("address", null);
        if (address == null) { call.reject("اختار طابعة حرارية أولًا"); return; }
        if (html.length() < 20 || html.length() > 750_000) { call.reject("محتوى الفاتورة غير صالح"); return; }
        if (!printing.compareAndSet(false, true)) { call.reject("هناك فاتورة قيد الطباعة"); return; }
        int width = "58mm".equals(getContext().getSharedPreferences("thermal_printer", Context.MODE_PRIVATE).getString("paperSize", "80mm")) ? 384 : 576;
        getActivity().runOnUiThread(() -> {
            WebView view = new WebView(getActivity());
            view.setLayerType(WebView.LAYER_TYPE_SOFTWARE, null);
            view.setBackgroundColor(0xffffffff);
            view.getSettings().setLoadsImagesAutomatically(true);
            view.measure(android.view.View.MeasureSpec.makeMeasureSpec(width, android.view.View.MeasureSpec.EXACTLY), android.view.View.MeasureSpec.makeMeasureSpec(2000, android.view.View.MeasureSpec.EXACTLY));
            view.layout(0, 0, width, 2000);
            view.setWebViewClient(new WebViewClient() {
                boolean started;
                @Override public void onPageFinished(WebView loaded, String url) {
                    if (started) return;
                    started = true;
                    loaded.postDelayed(() -> loaded.evaluateJavascript("Math.ceil(document.documentElement.scrollHeight * (window.devicePixelRatio || 1))", raw -> {
                        try {
                            int height = (int) Math.ceil(Double.parseDouble(raw.replace("\"", "")));
                            if (height <= 0 || height > 20000) throw new IllegalArgumentException("طول الفاتورة أكبر من حد الطابعة");
                            loaded.measure(android.view.View.MeasureSpec.makeMeasureSpec(width, android.view.View.MeasureSpec.EXACTLY), android.view.View.MeasureSpec.makeMeasureSpec(height, android.view.View.MeasureSpec.EXACTLY));
                            loaded.layout(0, 0, width, height);
                            Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.RGB_565);
                            bitmap.eraseColor(0xffffffff);
                            loaded.draw(new Canvas(bitmap));
                            worker.execute(() -> {
                                try {
                                    sendBitmap(address, bitmap);
                                    JSObject result = new JSObject(); result.put("printed", true); call.resolve(result);
                                } catch (Exception error) { call.reject("تعذر الاتصال بالطابعة أو إرسال الفاتورة: " + error.getMessage(), error); }
                                finally { bitmap.recycle(); printing.set(false); getActivity().runOnUiThread(loaded::destroy); }
                            });
                        } catch (Exception error) {
                            printing.set(false); loaded.destroy(); call.reject("تعذر تجهيز الفاتورة الحرارية: " + error.getMessage(), error);
                        }
                    }), 450);
                }
            });
            // The receipt layout itself is rendered to pixels, so Arabic and logos work without printer code pages.
            String override = "<style>html,body{width:100%!important;overflow:visible!important} .receipt{width:100%!important;max-width:100%!important;margin:0!important}</style></head>";
            view.loadDataWithBaseURL("https://localhost/", html.replace("</head>", override), "text/html", "UTF-8", null);
        });
    }

    private void sendBitmap(String address, Bitmap bitmap) throws Exception {
        BluetoothAdapter bluetooth = adapter();
        if (bluetooth == null || !bluetooth.isEnabled()) throw new IllegalStateException("Bluetooth مغلق");
        BluetoothDevice device = null;
        Set<BluetoothDevice> bonded = bluetooth.getBondedDevices();
        for (BluetoothDevice item : bonded) if (item.getAddress().equals(address)) device = item;
        if (device == null) throw new IllegalStateException("الطابعة لم تعد مقترنة بالجهاز");
        try (BluetoothSocket socket = device.createRfcommSocketToServiceRecord(SPP)) {
            socket.connect();
            OutputStream out = socket.getOutputStream();
            out.write(new byte[] {27, 64});
            int width = bitmap.getWidth();
            int rowBytes = (width + 7) / 8;
            for (int top = 0; top < bitmap.getHeight(); top += 128) {
                int rows = Math.min(128, bitmap.getHeight() - top);
                byte[] raster = new byte[8 + rowBytes * rows];
                raster[0] = 29; raster[1] = 118; raster[2] = 48; raster[3] = 0;
                raster[4] = (byte) rowBytes; raster[5] = (byte) (rowBytes >> 8);
                raster[6] = (byte) rows; raster[7] = (byte) (rows >> 8);
                for (int y = 0; y < rows; y++) for (int x = 0; x < width; x++) {
                    int color = bitmap.getPixel(x, top + y);
                    int luminance = ((color >> 16 & 255) * 299 + (color >> 8 & 255) * 587 + (color & 255) * 114) / 1000;
                    if (luminance < 180) raster[8 + y * rowBytes + x / 8] |= (byte) (0x80 >> (x % 8));
                }
                out.write(raster);
            }
            out.write(new byte[] {10, 10, 10, 29, 86, 1});
            out.flush();
        }
    }
}
