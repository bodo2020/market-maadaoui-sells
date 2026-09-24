package com.elmadawy.pos;

import android.content.Context;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "PosDevice")
public class PosDevicePlugin extends Plugin {
    @PluginMethod
    public void getInsets(PluginCall call) {
        WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(getBridge().getWebView());
        JSObject result = new JSObject();
        if (insets != null) {
            androidx.core.graphics.Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            float density = getContext().getResources().getDisplayMetrics().density;
            result.put("top", Math.round(bars.top / density));
            result.put("bottom", Math.round(bars.bottom / density));
            result.put("left", Math.round(bars.left / density));
            result.put("right", Math.round(bars.right / density));
        }
        call.resolve(result);
    }
    @PluginMethod
    public void get(PluginCall call) {
        String branchId = call.getString("branchId", "");
        JSObject result = new JSObject();
        result.put("device", getContext().getSharedPreferences("pos_device", Context.MODE_PRIVATE).getString(branchId, null));
        call.resolve(result);
    }

    @PluginMethod
    public void save(PluginCall call) {
        String branchId = call.getString("branchId", "");
        String device = call.getString("device", "");
        if (!branchId.matches("[0-9a-fA-F-]{36}") || device.length() < 20 || device.length() > 8192) {
            call.reject("بيانات جهاز نقطة البيع غير صالحة");
            return;
        }
        getContext().getSharedPreferences("pos_device", Context.MODE_PRIVATE).edit().putString(branchId, device).apply();
        call.resolve();
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String branchId = call.getString("branchId", "");
        getContext().getSharedPreferences("pos_device", Context.MODE_PRIVATE).edit().remove(branchId).apply();
        call.resolve();
    }
}
