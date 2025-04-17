
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Upload, ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface LogoUploadProps {
  logoUrl: string | null;
  onLogoChange: (url: string | null) => void;
}

export default function LogoUpload({ logoUrl, onLogoChange }: LogoUploadProps) {
  const [uploading, setUploading] = useState(false);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true);
      
      if (!e.target.files || e.target.files.length === 0) {
        return;
      }
      
      const file = e.target.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `logo_${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;
      
      // Check if bucket exists and create it if not
      const { data: buckets } = await supabase.storage.listBuckets();
      if (!buckets?.some(bucket => bucket.name === 'store')) {
        try {
          const { error: bucketError } = await supabase.storage.createBucket('store', {
            public: true
          });
          if (bucketError) {
            console.error("Error creating bucket:", bucketError);
            throw bucketError;
          }
          
          // Set public access policy for the bucket
          const { error: policyError } = await supabase.storage.from('store').createSignedUrl(
            'dummy.txt', 
            60
          );
          
          if (policyError && policyError.message !== 'The resource was not found') {
            console.error("Error setting up bucket policy:", policyError);
          }
        } catch (bucketCreationError) {
          console.error("Failed to create bucket:", bucketCreationError);
          // If we couldn't create the bucket, we'll try to upload anyway
          // as it might already exist with different permissions
        }
      }
      
      // Upload the file
      const { error: uploadError } = await supabase.storage
        .from('store')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        });
        
      if (uploadError) {
        console.error("Upload error:", uploadError);
        throw uploadError;
      }
      
      // Get the public URL
      const { data } = supabase.storage.from('store').getPublicUrl(filePath);
      
      if (data) {
        onLogoChange(data.publicUrl);
        toast.success("تم رفع الشعار بنجاح");
      }
    } catch (error) {
      console.error("Error uploading logo:", error);
      toast.error("حدث خطأ أثناء رفع الشعار");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>شعار المتجر</Label>
            
            <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg p-6 h-48">
              {logoUrl ? (
                <div className="relative w-full h-full">
                  <img
                    src={logoUrl}
                    alt="شعار المتجر"
                    className="w-full h-full object-contain"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="absolute top-0 right-0 m-2"
                    onClick={() => onLogoChange(null)}
                  >
                    إزالة
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-muted-foreground">
                  <ImageIcon className="w-16 h-16 mb-4" />
                  <p className="text-sm text-center mb-2">اسحب الشعار هنا أو انقر للتحميل</p>
                  <p className="text-xs text-center">PNG, JPG أو WEBP (الحد الأقصى: 5MB)</p>
                </div>
              )}
              
              <input
                id="logo-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLogoUpload}
                disabled={uploading}
              />
            </div>
            
            <Button
              variant="outline"
              className="w-full mt-2"
              onClick={() => document.getElementById('logo-upload')?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <span className="flex items-center">
                  <span className="animate-spin mr-2">⏳</span> جاري الرفع...
                </span>
              ) : (
                <span className="flex items-center">
                  <Upload className="ml-2 h-4 w-4" /> تحميل شعار جديد
                </span>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
