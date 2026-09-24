package com.elmadawy.pos;

import android.os.CancellationSignal;
import java.util.Collections;

import androidx.core.content.ContextCompat;
import androidx.credentials.CreateCredentialResponse;
import androidx.credentials.CreatePasswordRequest;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.GetPasswordOption;
import androidx.credentials.PasswordCredential;
import androidx.credentials.exceptions.CreateCredentialException;
import androidx.credentials.exceptions.GetCredentialException;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "PosCredentials")
public class PosCredentialsPlugin extends Plugin {
    @PluginMethod
    public void savePassword(PluginCall call) {
        String username = call.getString("username");
        String password = call.getString("password");
        if (username == null || username.trim().isEmpty() || password == null || password.isEmpty()) {
            call.reject("اسم المستخدم وكلمة المرور مطلوبان");
            return;
        }
        CredentialManager.create(getContext()).createCredentialAsync(
            getActivity(), new CreatePasswordRequest(username.trim(), password, null, false, false),
            new CancellationSignal(), ContextCompat.getMainExecutor(getContext()),
            new CredentialManagerCallback<CreateCredentialResponse, CreateCredentialException>() {
                @Override public void onResult(CreateCredentialResponse response) {
                    JSObject result = new JSObject();
                    result.put("saved", true);
                    call.resolve(result);
                }
                @Override public void onError(CreateCredentialException error) {
                    call.reject("تم إلغاء حفظ كلمة المرور أو أن الخدمة غير متاحة", error);
                }
            });
    }

    @PluginMethod
    public void getPassword(PluginCall call) {
        GetCredentialRequest request = new GetCredentialRequest.Builder()
            .addCredentialOption(new GetPasswordOption(Collections.emptySet(), false, Collections.emptySet()))
            .build();
        CredentialManager.create(getContext()).getCredentialAsync(
            getActivity(), request, new CancellationSignal(), ContextCompat.getMainExecutor(getContext()),
            new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                @Override public void onResult(GetCredentialResponse response) {
                    Credential credential = response.getCredential();
                    if (!(credential instanceof PasswordCredential)) {
                        call.reject("الاختيار ليس كلمة مرور محفوظة");
                        return;
                    }
                    PasswordCredential selected = (PasswordCredential) credential;
                    JSObject result = new JSObject();
                    result.put("username", selected.getId());
                    result.put("password", selected.getPassword());
                    call.resolve(result);
                }
                @Override public void onError(GetCredentialException error) {
                    call.reject("لا توجد كلمة مرور مختارة أو تم إلغاء الاختيار", error);
                }
            });
    }
}
