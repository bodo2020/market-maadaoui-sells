import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Upload, X, Image as ImageIcon, ImageDown, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { compressCatalogImage, formatFileSize } from "@/lib/imageCompression";

interface DragDropImageProps {
  value: string | null;
  onChange: (url: string | null) => void;
  bucketName?: string;
  folder?: string;
  maxDimension?: number;
  targetBytes?: number;
}

type CompressionSummary = {
  before: number;
  after: number;
  width: number;
  height: number;
};

type StorageObjectRef = {
  bucket: string;
  path: string;
};

function storageObjectFromUrl(urlValue: string, fallbackBucket: string): StorageObjectRef | null {
  try {
    const url = new URL(urlValue);
    const pathname = decodeURIComponent(url.pathname);
    const markers = [
      "/storage/v1/object/public/",
      "/storage/v1/object/sign/",
      "/storage/v1/object/authenticated/",
      "/storage/v1/render/image/public/",
      "/storage/v1/render/image/authenticated/",
    ];

    for (const marker of markers) {
      const markerIndex = pathname.indexOf(marker);
      if (markerIndex < 0) continue;

      const remainder = pathname.slice(markerIndex + marker.length).replace(/^\/+/, "");
      const slashIndex = remainder.indexOf("/");
      if (slashIndex <= 0) return null;

      const bucket = remainder.slice(0, slashIndex) || fallbackBucket;
      const path = remainder.slice(slashIndex + 1).replace(/^\/+/, "");
      if (!bucket || !path) return null;

      return { bucket, path };
    }

    return null;
  } catch {
    return null;
  }
}

export function DragDropImage({
  value,
  onChange,
  bucketName = "images",
  folder,
  maxDimension = 800,
  targetBytes = 140 * 1024,
}: DragDropImageProps) {
  const reactId = useId();
  const inputId = `image-upload-${reactId.replace(/:/g, "")}`;
  const [dragging, setDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [compression, setCompression] = useState<CompressionSummary | null>(null);

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) await handleUpload(file);
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await handleUpload(file);
  };

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("يرجى اختيار ملف صورة فقط");
      return;
    }

    try {
      setIsUploading(true);
      setCompression(null);

      const optimized = await compressCatalogImage(file, { maxDimension, targetBytes });
      const safeFolder = (folder || bucketName).replace(/^\/+|\/+$/g, "") || "uploads";
      const filePath = `${safeFolder}/${crypto.randomUUID()}.webp`;

      const { data, error } = await supabase.storage
        .from(bucketName)
        .upload(filePath, optimized.file, {
          cacheControl: "31536000",
          contentType: optimized.mimeType || "image/webp",
          upsert: false,
        });

      if (error) throw error;

      const { data: publicData } = supabase.storage
        .from(bucketName)
        .getPublicUrl(data.path);

      setCompression({
        before: optimized.originalBytes,
        after: optimized.compressedBytes,
        width: optimized.width,
        height: optimized.height,
      });
      onChange(publicData.publicUrl);

      const savedPercent = optimized.originalBytes > 0
        ? Math.max(0, Math.round((1 - optimized.compressedBytes / optimized.originalBytes) * 100))
        : 0;
      toast.success(
        savedPercent > 0
          ? `تم ضغط ورفع الصورة — وفرنا تقريبًا ${savedPercent}% من المساحة`
          : "تم تحسين ورفع الصورة بنجاح",
      );
    } catch (error: any) {
      console.error("Image upload failed:", error);
      const message = error?.message === "IMAGE_DECODE_FAILED"
        ? "تعذر قراءة الصورة. جرّب صورة JPG أو PNG أو WebP سليمة."
        : error?.message === "IMAGE_CANVAS_UNAVAILABLE"
          ? "المتصفح لا يدعم ضغط الصورة على هذا الجهاز."
          : error?.message || "حدث خطأ أثناء رفع الصورة";
      toast.error(message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemove = async () => {
    if (!value || isDeleting) return;

    const storageObject = storageObjectFromUrl(value, bucketName);
    if (!storageObject) {
      // External/legacy images that are not Supabase Storage objects have no bucket object to remove.
      onChange(null);
      setCompression(null);
      toast.info("تم إزالة الصورة من السجل؛ الرابط لا يشير إلى ملف داخل Supabase Storage");
      return;
    }

    try {
      setIsDeleting(true);
      const { data, error } = await supabase.storage
        .from(storageObject.bucket)
        .remove([storageObject.path]);

      if (error) throw error;

      // Supabase can return an empty array when no object matched the requested path.
      if (!data || data.length === 0) {
        throw new Error("لم يتم العثور على ملف الصورة داخل الـStorage لحذفه");
      }

      onChange(null);
      setCompression(null);
      toast.success(`تم حذف الصورة نهائيًا من bucket ${storageObject.bucket}`);
    } catch (error: any) {
      console.error("Image removal failed:", error);
      toast.error(error?.message || "تعذر حذف الصورة من Supabase Storage");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative aspect-[4/3] max-h-[300px] rounded-xl border-2 border-dashed p-3 transition-colors
          ${dragging ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}
          ${isUploading || isDeleting ? "pointer-events-none opacity-60" : ""}`}
      >
        {value ? (
          <div className="relative h-full w-full">
            <img
              src={value}
              alt="الصورة المرفوعة"
              className="h-full w-full rounded-lg object-contain"
            />
            <button
              type="button"
              onClick={handleRemove}
              disabled={isDeleting}
              aria-label="حذف الصورة من التخزين"
              className="absolute end-2 top-2 rounded-full bg-background/95 p-1.5 shadow hover:bg-muted disabled:cursor-not-allowed"
            >
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin text-destructive" /> : <X className="h-4 w-4 text-destructive" />}
            </button>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-center">
            {isUploading ? (
              <>
                <ImageDown className="mb-3 h-10 w-10 animate-pulse text-primary" />
                <p className="font-medium">جاري ضغط الصورة ورفعها...</p>
                <p className="mt-1 text-xs text-muted-foreground">يتم تحويلها لصيغة WebP قبل الرفع</p>
              </>
            ) : (
              <>
                <Upload className="mb-3 h-10 w-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">اسحب الصورة هنا أو اختر صورة من الجهاز</p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3"
                  onClick={() => document.getElementById(inputId)?.click()}
                >
                  <ImageIcon className="ms-2 h-4 w-4" />
                  اختر صورة
                </Button>
              </>
            )}
          </div>
        )}
        <input
          id={inputId}
          type="file"
          className="hidden"
          accept="image/jpeg,image/png,image/webp,image/avif"
          onChange={handleFileChange}
          disabled={isUploading || isDeleting}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>يتم التصغير تلقائيًا حتى {maxDimension}px والتحويل إلى WebP.</span>
        {compression && (
          <span className="rounded-full bg-muted px-2.5 py-1 font-medium text-foreground">
            {formatFileSize(compression.before)} → {formatFileSize(compression.after)} · {compression.width}×{compression.height}
          </span>
        )}
      </div>
    </div>
  );
}
