
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Upload, X, Image as ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface DragDropImageProps {
  value: string | null;
  onChange: (url: string | null) => void;
  bucketName?: string;
}

export function DragDropImage({ value, onChange, bucketName = "images" }: DragDropImageProps) {
  const [dragging, setDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Check bucket exists when component mounts (no creation needed)
  useEffect(() => {
    const checkBucketExists = async () => {
      try {
        const { data: buckets } = await supabase.storage.listBuckets();
        const bucketExists = buckets?.some(bucket => bucket.name === bucketName);
        
        if (!bucketExists) {
          console.warn(`Bucket ${bucketName} does not exist. Make sure it's created in Supabase.`);
          toast.error(`مجلد التخزين ${bucketName} غير موجود. تواصل مع المسؤول.`);
        }
      } catch (error) {
        console.error("Error checking bucket:", error);
      }
    };

    checkBucketExists();
  }, [bucketName]);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      await handleUpload(files[0]);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await handleUpload(file);
    }
  };

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('يرجى اختيار ملف صورة فقط');
      return;
    }

    try {
      setIsUploading(true);
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
      const filePath = `categories/${fileName}`;

      console.log(`Attempting to upload to bucket: ${bucketName}, file path: ${filePath}`);

      // Upload the file directly (bucket should already exist)
      const { data, error } = await supabase.storage
        .from(bucketName)
        .upload(filePath, file);

      if (error) {
        console.error(`Error uploading to ${bucketName}:`, error);
        toast.error(`حدث خطأ أثناء رفع الصورة: ${error.message}`);
        return;
      }

      // Get the public URL for the uploaded file
      const { data: { publicUrl } } = supabase.storage
        .from(bucketName)
        .getPublicUrl(data.path);

      console.log(`File uploaded successfully. Public URL: ${publicUrl}`);
      onChange(publicUrl);
      toast.success('تم رفع الصورة بنجاح');
    } catch (error) {
      console.error('Error uploading image:', error);
      toast.error('حدث خطأ أثناء رفع الصورة');
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemove = async () => {
    if (!value) return;
    
    try {
      // Extract file path from the URL
      const url = new URL(value);
      const pathParts = url.pathname.split('/');
      const filePath = pathParts.slice(pathParts.indexOf('object') + 2).join('/');
      
      console.log(`Attempting to delete file: ${filePath} from bucket: ${bucketName}`);
      
      // Delete the file from Supabase storage
      const { error } = await supabase.storage
        .from(bucketName)
        .remove([filePath]);
      
      if (error) {
        console.error('Error deleting file from storage:', error);
        toast.error('حدث خطأ أثناء حذف الصورة من التخزين');
        return;
      }
      
      // Update the UI state
      onChange(null);
      toast.success('تم حذف الصورة بنجاح');
      
    } catch (error) {
      console.error('Error removing image:', error);
      toast.error('حدث خطأ أثناء حذف الصورة');
    }
  };

  return (
    <div className="space-y-4">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative aspect-video rounded-lg border-2 border-dashed p-4 transition-colors
          ${dragging ? 'border-primary bg-primary/10' : 'border-gray-300 hover:border-primary/50'}
          ${isUploading ? 'opacity-50' : ''}`}
      >
        {value ? (
          <div className="relative h-full w-full">
            <img 
              src={value} 
              alt="Uploaded" 
              className="h-full w-full object-contain"
            />
            <button
              type="button"
              onClick={handleRemove}
              className="absolute top-2 right-2 rounded-full bg-white p-1 shadow-md hover:bg-gray-100"
            >
              <X className="h-4 w-4 text-red-500" />
            </button>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center">
            <div className="mb-4">
              {isUploading ? (
                <div className="animate-pulse">جاري الرفع...</div>
              ) : (
                <>
                  <Upload className="mx-auto h-12 w-12 text-gray-400" />
                  <p className="mt-2 text-sm text-gray-500">
                    اسحب وأفلت الصورة هنا أو
                  </p>
                </>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={isUploading}
              onClick={() => document.getElementById('image-upload')?.click()}
            >
              <ImageIcon className="ml-2 h-4 w-4" />
              اختر صورة
            </Button>
          </div>
        )}
        <input
          id="image-upload"
          type="file"
          className="hidden"
          accept="image/*"
          onChange={handleFileChange}
          disabled={isUploading}
        />
      </div>
    </div>
  );
}
