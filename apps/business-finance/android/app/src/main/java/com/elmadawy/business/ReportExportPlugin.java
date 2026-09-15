package com.elmadawy.business;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "ReportExport")
public class ReportExportPlugin extends Plugin {

    @PluginMethod
    public void printCurrentView(PluginCall call) {
        final String jobName = call.getString("jobName", "Elmadawy Report");
        getActivity().runOnUiThread(() -> {
            try {
                PrintManager printManager = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                PrintDocumentAdapter adapter = getBridge().getWebView().createPrintDocumentAdapter(jobName);
                printManager.print(jobName, adapter, new PrintAttributes.Builder().build());
                call.resolve();
            } catch (Exception error) {
                call.reject("PRINT_FAILED", error);
            }
        });
    }

    @PluginMethod
    public void shareTextFile(PluginCall call) {
        String fileName = sanitizeFileName(call.getString("fileName", "elmadawy-report.csv"));
        String content = call.getString("content", "");
        String mimeType = call.getString("mimeType", "text/csv");
        String title = call.getString("title", "تصدير تقرير المعداوي");

        try {
            File exportDir = new File(getContext().getCacheDir(), "report_exports");
            if (!exportDir.exists() && !exportDir.mkdirs()) {
                call.reject("EXPORT_DIR_FAILED");
                return;
            }
            File output = new File(exportDir, fileName);
            try (FileOutputStream stream = new FileOutputStream(output, false)) {
                stream.write(content.getBytes(StandardCharsets.UTF_8));
                stream.flush();
            }

            Uri uri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                output
            );

            Intent share = new Intent(Intent.ACTION_SEND);
            share.setType(mimeType);
            share.putExtra(Intent.EXTRA_STREAM, uri);
            share.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(share, title);
            getActivity().startActivity(chooser);

            JSObject result = new JSObject();
            result.put("fileName", fileName);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("EXPORT_FAILED", error);
        }
    }

    private String sanitizeFileName(String value) {
        String cleaned = value == null ? "elmadawy-report.csv" : value.replaceAll("[\\\\/:*?\"<>|]", "-").trim();
        return cleaned.isEmpty() ? "elmadawy-report.csv" : cleaned;
    }
}
