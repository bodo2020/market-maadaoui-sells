package com.elmadawy.hr;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.MutableContextWrapper;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.inputmethod.InputMethodManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CreateCredentialResponse;
import androidx.credentials.CreatePasswordRequest;
import androidx.credentials.exceptions.CreateCredentialException;
import androidx.exifinterface.media.ExifInterface;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;
import org.json.JSONTokener;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.util.List;

public class MainActivity extends BridgeActivity {
  private static final int CAMERA_REQUEST_CODE = 7411;
  private static final int CAMERA_PERMISSION_CODE = 7412;
  private static final long EXIT_WINDOW_MS = 1800L;

  private long lastBackAt = 0L;
  private boolean pendingCameraAfterPermission = false;
  private File pendingAttendancePhoto;

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    WebView webView = getBridge() != null ? getBridge().getWebView() : null;
    if (webView != null) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        webView.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_YES);
      }
      webView.addJavascriptInterface(new HrNativeBridge(), "HrNative");
    }

    getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
      @Override
      public void handleOnBackPressed() {
        handleHrBackButton();
      }
    });
  }

  private boolean isTrustedHrPage() {
    WebView webView = getBridge() != null ? getBridge().getWebView() : null;
    if (webView == null) return false;
    String url = webView.getUrl();
    return url != null && (url.equals("https://localhost") || url.startsWith("https://localhost/"));
  }

  private class HrNativeBridge {
    @JavascriptInterface
    public void savePassword(String username, String password) {
      if (!isTrustedHrPage() || username == null || username.trim().isEmpty() || password == null || password.isEmpty()) return;
      runOnUiThread(() -> savePasswordWithCredentialManager(username.trim(), password));
    }

    @JavascriptInterface
    public void captureAttendancePhoto() {
      if (!isTrustedHrPage()) return;
      runOnUiThread(MainActivity.this::ensureCameraPermissionAndOpen);
    }
  }

  private void savePasswordWithCredentialManager(String username, String password) {
    try {
      CredentialManager credentialManager = CredentialManager.create(this);
      CreatePasswordRequest request = new CreatePasswordRequest(username, password, null, false, false);
      MutableContextWrapper context = new MutableContextWrapper(this);
      credentialManager.createCredentialAsync(
        context,
        request,
        null,
        ContextCompat.getMainExecutor(this),
        new CredentialManagerCallback<CreateCredentialResponse, CreateCredentialException>() {
          @Override
          public void onResult(CreateCredentialResponse result) {
            sendJsEvent("hrNativeCredentialSaveResult", "{\"ok\":true}");
          }

          @Override
          public void onError(CreateCredentialException error) {
            String message = error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage();
            sendJsEvent("hrNativeCredentialSaveResult", "{\"ok\":false,\"error\":" + JSONObject.quote(message) + "}");
          }
        }
      );
    } catch (Throwable error) {
      String message = error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage();
      sendJsEvent("hrNativeCredentialSaveResult", "{\"ok\":false,\"error\":" + JSONObject.quote(message) + "}");
    }
  }

  private void ensureCameraPermissionAndOpen() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
      pendingCameraAfterPermission = true;
      requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION_CODE);
      return;
    }
    openAttendanceCamera();
  }

  private void openAttendanceCamera() {
    try {
      Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
      if (intent.resolveActivity(getPackageManager()) == null) {
        sendCameraResult(null, false, "لا يوجد تطبيق كاميرا متاح على الجهاز.");
        return;
      }

      pendingAttendancePhoto = File.createTempFile("hr_attendance_", ".jpg", getCacheDir());
      Uri photoUri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", pendingAttendancePhoto);
      intent.putExtra(MediaStore.EXTRA_OUTPUT, photoUri);
      intent.putExtra("android.intent.extras.CAMERA_FACING", 1);
      intent.putExtra("android.intent.extra.USE_FRONT_CAMERA", true);
      intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);

      List<ResolveInfo> cameraApps = getPackageManager().queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY);
      for (ResolveInfo app : cameraApps) {
        grantUriPermission(app.activityInfo.packageName, photoUri, Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
      }

      startActivityForResult(intent, CAMERA_REQUEST_CODE);
    } catch (Throwable error) {
      sendCameraResult(null, false, "تعذر فتح كاميرا الهاتف. تأكد من صلاحية الكاميرا وحاول مرة أخرى.");
    }
  }

  @Override
  public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    if (requestCode != CAMERA_PERMISSION_CODE) return;
    boolean shouldOpen = pendingCameraAfterPermission;
    pendingCameraAfterPermission = false;
    if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED && shouldOpen) {
      openAttendanceCamera();
    } else {
      sendCameraResult(null, false, "لازم تسمح للتطبيق باستخدام الكاميرا علشان صورة تحقق الحضور.");
    }
  }

  @Override
  protected void onActivityResult(int requestCode, int resultCode, Intent data) {
    super.onActivityResult(requestCode, resultCode, data);
    if (requestCode != CAMERA_REQUEST_CODE) return;

    if (resultCode != Activity.RESULT_OK) {
      cleanupPendingPhoto();
      sendCameraResult(null, true, null);
      return;
    }

    try {
      String dataUrl = prepareAttendancePhotoDataUrl(pendingAttendancePhoto);
      cleanupPendingPhoto();
      sendCameraResult(dataUrl, false, null);
    } catch (Throwable error) {
      cleanupPendingPhoto();
      sendCameraResult(null, false, "تعذر تجهيز صورة الحضور. أعد التصوير.");
    }
  }

  private String prepareAttendancePhotoDataUrl(File file) throws Exception {
    if (file == null || !file.exists() || file.length() == 0) throw new IllegalStateException("empty_photo");

    BitmapFactory.Options bounds = new BitmapFactory.Options();
    bounds.inJustDecodeBounds = true;
    BitmapFactory.decodeFile(file.getAbsolutePath(), bounds);
    int sample = 1;
    int largest = Math.max(bounds.outWidth, bounds.outHeight);
    while (largest / sample > 1280) sample *= 2;

    BitmapFactory.Options options = new BitmapFactory.Options();
    options.inSampleSize = Math.max(1, sample);
    Bitmap bitmap = BitmapFactory.decodeFile(file.getAbsolutePath(), options);
    if (bitmap == null) throw new IllegalStateException("decode_failed");

    ExifInterface exif = new ExifInterface(file.getAbsolutePath());
    int orientation = exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
    Matrix matrix = new Matrix();
    if (orientation == ExifInterface.ORIENTATION_ROTATE_90) matrix.postRotate(90);
    else if (orientation == ExifInterface.ORIENTATION_ROTATE_180) matrix.postRotate(180);
    else if (orientation == ExifInterface.ORIENTATION_ROTATE_270) matrix.postRotate(270);
    else if (orientation == ExifInterface.ORIENTATION_FLIP_HORIZONTAL) matrix.preScale(-1, 1);

    Bitmap corrected = matrix.isIdentity() ? bitmap : Bitmap.createBitmap(bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), matrix, true);
    ByteArrayOutputStream output = new ByteArrayOutputStream();
    corrected.compress(Bitmap.CompressFormat.JPEG, 82, output);
    byte[] bytes = output.toByteArray();
    if (bytes.length > 4_500_000) {
      output.reset();
      corrected.compress(Bitmap.CompressFormat.JPEG, 68, output);
      bytes = output.toByteArray();
    }

    if (corrected != bitmap) corrected.recycle();
    bitmap.recycle();
    return "data:image/jpeg;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP);
  }

  private void cleanupPendingPhoto() {
    try {
      if (pendingAttendancePhoto != null && pendingAttendancePhoto.exists()) pendingAttendancePhoto.delete();
    } catch (Throwable ignored) {
    }
    pendingAttendancePhoto = null;
  }

  private void sendCameraResult(String dataUrl, boolean cancelled, String error) {
    String payload = "{\"cancelled\":" + cancelled +
      ",\"dataUrl\":" + (dataUrl == null ? "null" : JSONObject.quote(dataUrl)) +
      ",\"error\":" + (error == null ? "null" : JSONObject.quote(error)) + "}";
    sendJsEvent("hrNativeCameraResult", payload);
  }

  private void sendJsEvent(String eventName, String detailJson) {
    WebView webView = getBridge() != null ? getBridge().getWebView() : null;
    if (webView == null) return;
    webView.post(() -> webView.evaluateJavascript(
      "window.dispatchEvent(new CustomEvent(" + JSONObject.quote(eventName) + ",{detail:" + detailJson + "}));",
      null
    ));
  }

  private void handleHrBackButton() {
    WebView webView = getBridge() != null ? getBridge().getWebView() : null;
    if (webView == null) {
      finish();
      return;
    }

    String probe = "(function(){" +
      "var e=document.activeElement;" +
      "if(e&&['INPUT','TEXTAREA','SELECT'].indexOf(e.tagName)>=0){e.blur();return 'INPUT';}" +
      "var d=document.querySelector('[role=\\\"dialog\\\"][data-state=\\\"open\\\"],[data-state=\\\"open\\\"][data-radix-dialog-content]');" +
      "if(d){document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}));return 'OVERLAY';}" +
      "return 'PATH:'+window.location.pathname+'|HISTORY:'+window.history.length;" +
      "})()";

    webView.evaluateJavascript(probe, raw -> {
      String value = raw;
      try {
        Object parsed = new JSONTokener(raw).nextValue();
        if (parsed instanceof String) value = (String) parsed;
      } catch (Throwable ignored) {
      }

      if ("INPUT".equals(value)) {
        InputMethodManager inputMethodManager = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
        inputMethodManager.hideSoftInputFromWindow(webView.getWindowToken(), 0);
        return;
      }
      if ("OVERLAY".equals(value)) return;

      String path = "/";
      int historyLength = 0;
      if (value != null && value.startsWith("PATH:")) {
        String[] parts = value.substring(5).split("\\|HISTORY:", 2);
        path = parts.length > 0 ? parts[0] : "/";
        if (parts.length > 1) {
          try { historyLength = Integer.parseInt(parts[1]); } catch (NumberFormatException ignored) { }
        }
      }

      boolean root = "/".equals(path) || "/dashboard".equals(path) || "/login".equals(path);
      if (root) {
        long now = System.currentTimeMillis();
        if (now - lastBackAt <= EXIT_WINDOW_MS) {
          lastBackAt = 0L;
          finish();
        } else {
          lastBackAt = now;
          Toast.makeText(this, "اضغط زر الرجوع مرة أخرى للخروج", Toast.LENGTH_SHORT).show();
        }
        return;
      }

      lastBackAt = 0L;
      if (historyLength > 1) webView.evaluateJavascript("window.history.back();", null);
      else webView.evaluateJavascript("window.location.assign('/');", null);
    });
  }
}
