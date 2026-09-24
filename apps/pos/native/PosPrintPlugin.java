package com.elmadawy.pos;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "PosPrint")
public class PosPrintPlugin extends Plugin {
    // Keep the WebView alive while Android's print service reads the document.
    private WebView printView;

    @PluginMethod
    public void printHtml(PluginCall call) {
        String html = call.getString("html");
        String title = call.getString("title", "فاتورة المعداوي");
        String paperSize = call.getString("paperSize", "80mm");
        if (html == null || html.length() < 20 || html.length() > 750_000) {
            call.reject("محتوى الفاتورة غير صالح للطباعة");
            return;
        }
        getActivity().runOnUiThread(() -> {
            try {
                WebView view = new WebView(getActivity());
                printView = view;
                view.setWebViewClient(new WebViewClient() {
                    private boolean started = false;
                    @Override
                    public void onPageFinished(WebView loaded, String url) {
                        if (started) return;
                        started = true;
                        loaded.postDelayed(() -> {
                            try {
                                PrintManager manager = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                                if (manager == null) { call.reject("خدمة الطباعة غير متاحة على الجهاز"); return; }
                                PrintAttributes.Builder attributes = new PrintAttributes.Builder()
                                    .setColorMode(PrintAttributes.COLOR_MODE_MONOCHROME);
                                if ("58mm".equals(paperSize) || "80mm".equals(paperSize)) {
                                    int widthMils = "58mm".equals(paperSize) ? 2283 : 3150;
                                    attributes.setMediaSize(new PrintAttributes.MediaSize("receipt_" + paperSize, paperSize, widthMils, 11000));
                                } else {
                                    attributes.setMediaSize(PrintAttributes.MediaSize.ISO_A4);
                                }
                                manager.print(title, loaded.createPrintDocumentAdapter(title), attributes.build());
                                JSObject result = new JSObject();
                                result.put("started", true);
                                call.resolve(result);
                            } catch (Exception error) {
                                call.reject("تعذر فتح طباعة أندرويد", error);
                            }
                        }, 300);
                    }
                });
                view.loadDataWithBaseURL("https://localhost/", html, "text/html", "UTF-8", null);
            } catch (Exception error) {
                call.reject("تعذر إعداد الفاتورة للطباعة", error);
            }
        });
    }
}
