import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

type NativeCameraDetail = {
  dataUrl?: string;
  cancelled?: boolean;
  error?: string;
};

function getNativeBridge() {
  if (typeof window === "undefined") return null;
  const bridge = (window as any).HrNative;
  return bridge && typeof bridge.captureAttendancePhoto === "function" ? bridge : null;
}

function dataUrlToBlob(dataUrl: string) {
  const [header, payload] = dataUrl.split(",", 2);
  const mime = header.match(/data:([^;]+)/)?.[1] || "image/jpeg";
  const binary = atob(payload || "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mime });
}

export default function LiveAttendancePhoto({ value, onChange }: { value: Blob | null; onChange: (blob: Blob | null) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [starting, setStarting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const nativeBridge = getNativeBridge();

  const stopWebCamera = () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  };

  const startWebCamera = async () => {
    stopWebCamera();
    setCameraError(null);
    setStarting(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("camera_unavailable");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 960 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setCameraError("تعذر فتح الكاميرا. اسمح بصلاحية الكاميرا وحاول مرة أخرى.");
    } finally {
      setStarting(false);
    }
  };

  const startNativeCamera = () => {
    if (!nativeBridge) return;
    setCameraError(null);
    setStarting(true);
    try {
      nativeBridge.captureAttendancePhoto();
    } catch {
      setStarting(false);
      setCameraError("تعذر تشغيل كاميرا Android. حاول مرة أخرى.");
    }
  };

  const start = () => {
    onChange(null);
    if (nativeBridge) startNativeCamera();
    else void startWebCamera();
  };

  useEffect(() => {
    const handleNativeResult = (event: Event) => {
      const detail = (event as CustomEvent<NativeCameraDetail>).detail || {};
      setStarting(false);
      if (detail.cancelled) {
        setCameraError("تم إلغاء التصوير. اضغط إعادة المحاولة لفتح الكاميرا.");
        return;
      }
      if (detail.error || !detail.dataUrl) {
        setCameraError(detail.error || "تعذر التقاط صورة التحقق.");
        return;
      }
      try {
        const blob = dataUrlToBlob(detail.dataUrl);
        if (!blob.size) throw new Error("empty_photo");
        onChange(blob);
        setCameraError(null);
      } catch {
        setCameraError("تعذر تجهيز الصورة. أعد التصوير.");
      }
    };

    window.addEventListener("hrNativeCameraResult", handleNativeResult as EventListener);
    if (nativeBridge) startNativeCamera();
    else void startWebCamera();

    return () => {
      window.removeEventListener("hrNativeCameraResult", handleNativeResult as EventListener);
      stopWebCamera();
    };
    // Intentionally start once when the outside-geofence verification step mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!value) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(value);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  const captureWebPhoto = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setCameraError("الكاميرا لم تجهز بعد. انتظر لحظة ثم حاول.");
      return;
    }
    const maxWidth = 720;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob) return;
    onChange(blob);
    stopWebCamera();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-black">صورة تحقق مباشرة</div>
          <div className="mt-1 text-xs text-muted-foreground">عند الخروج من نطاق الفرع يفتح Android الكاميرا مباشرة لإثبات محاولة الحضور.</div>
        </div>
        {value && <div className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-800"><ShieldCheck className="h-3.5 w-3.5" />تم الالتقاط</div>}
      </div>

      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border bg-slate-950">
        {previewUrl ? (
          <img src={previewUrl} alt="صورة التحقق" className="h-full w-full object-cover" />
        ) : nativeBridge ? (
          <div className="grid h-full place-items-center p-6 text-center text-white">
            <div><Camera className="mx-auto mb-3 h-9 w-9 opacity-80" /><p className="text-sm">{starting ? "جاري فتح كاميرا الهاتف..." : "التقط صورة مباشرة من كاميرا الهاتف"}</p></div>
          </div>
        ) : (
          <video ref={videoRef} playsInline muted className="h-full w-full -scale-x-100 object-cover" />
        )}
        {starting && <div className="absolute inset-0 grid place-items-center bg-slate-950/50 text-white"><Loader2 className="h-7 w-7 animate-spin" /></div>}
        {cameraError && <div className="absolute inset-0 grid place-items-center bg-slate-950/90 p-6 text-center text-sm text-white"><div><Camera className="mx-auto mb-3 h-8 w-8 opacity-70" /><p>{cameraError}</p></div></div>}
      </div>

      {value ? (
        <Button type="button" variant="outline" className="w-full" onClick={start}><RefreshCw className="ml-2 h-4 w-4" />إعادة التصوير</Button>
      ) : nativeBridge ? (
        <Button type="button" className="w-full bg-[#005931] hover:bg-[#004526]" disabled={starting} onClick={start}><Camera className="ml-2 h-4 w-4" />{cameraError ? "إعادة فتح الكاميرا" : "فتح الكاميرا"}</Button>
      ) : (
        <Button type="button" className="w-full bg-[#005931] hover:bg-[#004526]" disabled={starting || Boolean(cameraError)} onClick={() => void captureWebPhoto()}><Camera className="ml-2 h-4 w-4" />التقاط الصورة الآن</Button>
      )}

      <p className="text-[11px] leading-5 text-muted-foreground">الصورة تحفظ في مساحة خاصة، ويطلع عليها المسؤول المصرح فقط، ثم تُحذف من مسار المراجعة بعد القرار مع الاحتفاظ بسجل التدقيق بدون الصورة.</p>
    </div>
  );
}
