
import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Upload, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface DragDropImageProps {
  value: string | null;
  onChange: (url: string | null) => void;
  bucketName: string;
}

export function DragDropImage({ value, onChange, bucketName }: DragDropImageProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const createBucketIfNotExists = async (bucket: string) => {
    try {
      // Call the edge function to create the bucket if it doesn't exist
      const { data, error } = await supabase.functions.invoke("create_products_bucket");
      
      if (error) {
        console.error("Error creating bucket:", error);
        throw error;
      }
      
      console.log("Bucket creation response:", data);
    } catch (err) {
      console.error("Error calling create_products_bucket function:", err);
    }
  };

  const handleUpload = async (file: File) => {
    if (!file) return;

    try {
      setIsUploading(true);
      
      // First ensure bucket exists
      await createBucketIfNotExists(bucketName);
      
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
      const filePath = fileName;

      const { data, error } = await supabase.storage
        .from(bucketName)
        .upload(filePath, file);

      if (error) {
        toast.error(`حدث خطأ أثناء رفع الصورة: ${error.message}`);
        console.error("Upload error:", error);
        return;
      }

      const { data: { publicUrl } } = supabase.storage
        .from(bucketName)
        .getPublicUrl(data.path);

      onChange(publicUrl);
      toast.success('تم رفع الصورة بنجاح');
    } catch (error) {
      console.error('Error uploading image:', error);
      toast.error('حدث خطأ أثناء رفع الصورة');
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleUpload(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleUpload(e.target.files[0]);
    }
  };

  const handleRemove = () => {
    onChange(null);
  };

  return (
    <div className="space-y-2">
      {value ? (
        <div className="relative aspect-square w-full max-w-[150px] rounded-md overflow-hidden border">
          <img 
            src={value} 
            alt="Uploaded image"
            className="w-full h-full object-cover"
          />
          <button
            type="button"
            onClick={handleRemove}
            className="absolute top-1 right-1 bg-white rounded-full p-1 shadow-md hover:bg-gray-100"
          >
            <X className="h-4 w-4 text-red-500" />
          </button>
        </div>
      ) : (
        <div
          className={`flex flex-col items-center justify-center w-full h-32 border-2 
            ${isDragging ? 'border-primary' : 'border-gray-300'} 
            border-dashed rounded-lg cursor-pointer 
            ${isDragging ? 'bg-primary/10' : 'bg-gray-50'} 
            hover:bg-gray-100 transition-colors`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleFileDrop}
        >
          <label
            htmlFor="image-upload"
            className="flex flex-col items-center justify-center w-full h-full cursor-pointer"
          >
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <Upload className="w-8 h-8 mb-2 text-gray-500" />
              <p className="mb-2 text-sm text-gray-500">
                <span className="font-medium">انقر لرفع صورة</span> أو اسحب وأفلت
              </p>
              <p className="text-xs text-gray-500">PNG, JPG, WEBP حتى 5MB</p>
            </div>
            <input
              id="image-upload"
              type="file"
              className="hidden"
              accept="image/*"
              onChange={handleFileChange}
              disabled={isUploading}
            />
          </label>
        </div>
      )}
      {isUploading && (
        <div className="text-center text-sm text-gray-500">
          جاري رفع الصورة...
        </div>
      )}
    </div>
  );
}
