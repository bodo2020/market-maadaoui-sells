import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LiveAttendancePhoto({ value, onChange }: { value: Blob | null; onChange: (blob: Blob | null) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [starting, setStarting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const stop = () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  };

  const start = async () => {
    stop();
    setCameraError(null);
    setStarting(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("camera_unavailable");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 960 } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setCameraError("تعذر فتح الكاميرا الأمامية. اسمح بصلاحية الكاميرا وحاول مرة أخرى.");
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    void start();
    return () => stop();
  }, []);

  useEffect(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (!value) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(value);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  const capture = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
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
    stop();
  };

  const retake = () => {
    onChange(null);
    void start();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div><div className="font-black">صورة تحقق مباشرة</div><div className="mt-1 text-xs text-muted-foreground">الكاميرا الأمامية فقط للتحقق من محاولة الحضور خارج النطاق.</div></div>
        {value && <div className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-800"><ShieldCheck className="h-3.5 w-3.5" />تم الالتقاط</div>}
      </div>
      <div className="relative overflow-hidden rounded-2xl border bg-slate-950 aspect-[4/3]">
        {previewUrl ? <img src={previewUrl} alt="صورة التحقق" className="h-full w-full object-cover" /> : <video ref={videoRef} playsInline muted className="h-full w-full object-cover -scale-x-100" />}
        {starting && <div className="absolute inset-0 grid place-items-center bg-slate-950/70 text-white"><Loader2 className="h-7 w-7 animate-spin" /></div>}
        {cameraError && <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-white"><div><Camera className="mx-auto mb-3 h-8 w-8 opacity-70" /><p>{cameraError}</p><Button type="button" variant="secondary" size="sm" className="mt-4" onClick={() => void start()}>إعادة المحاولة</Button></div></div>}
      </div>
      {value ? <Button type="button" variant="outline" className="w-full" onClick={retake}><RefreshCw className="ml-2 h-4 w-4" />إعادة التصوير</Button> : <Button type="button" className="w-full bg-[#005931] hover:bg-[#004526]" disabled={starting || Boolean(cameraError)} onClick={() => void capture()}><Camera className="ml-2 h-4 w-4" />التقاط الصورة الآن</Button>}
      <p className="text-[11px] leading-5 text-muted-foreground">الصورة تحفظ في مساحة خاصة، ويطلع عليها المسؤول المصرح فقط، ثم تُحذف تلقائيًا من مسار المراجعة بعد القرار مع الاحتفاظ بسجل التدقيق بدون الصورة.</p>
    </div>
  );
}
