
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Upload, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { createCompany, updateCompany, Company } from "@/services/supabase/companyService";
import { supabase } from "@/integrations/supabase/client";

interface CompanyFormProps {
  company?: Company;
  onSaved: () => void;
  onCancel: () => void;
}

export default function CompanyForm({ company, onSaved, onCancel }: CompanyFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [name, setName] = useState(company?.name || "");
  const [description, setDescription] = useState(company?.description || "");
  const [address, setAddress] = useState(company?.address || "");
  const [contactEmail, setContactEmail] = useState(company?.contact_email || "");
  const [contactPhone, setContactPhone] = useState(company?.contact_phone || "");
  const [logoPreview, setLogoPreview] = useState<string | null>(company?.logo_url || null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogoClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('image/')) {
        setLogoFile(file);
        const reader = new FileReader();
        reader.onloadend = () => {
          setLogoPreview(reader.result as string);
        };
        reader.readAsDataURL(file);
      } else {
        toast.error("الرجاء إرفاق ملف صورة فقط");
      }
    }
  };

  const uploadLogo = async (): Promise<string | null> => {
    if (!logoFile) return logoPreview;

    try {
      // Create a unique filename
      const fileExt = logoFile.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
      const filePath = `companies/${fileName}`;

      // Check if the companies bucket exists, create it if it doesn't
      const { data: buckets } = await supabase.storage.listBuckets();
      const companiesBucket = buckets?.find(bucket => bucket.name === 'companies');
      
      if (!companiesBucket) {
        await supabase.storage.createBucket('companies', {
          public: true
        });
      }

      // Upload the file
      const { error: uploadError } = await supabase.storage
        .from('companies')
        .upload(filePath, logoFile);

      if (uploadError) {
        console.error('Error uploading logo:', uploadError);
        throw uploadError;
      }

      // Get the public URL
      const { data } = supabase.storage.from('companies').getPublicUrl(filePath);
      return data.publicUrl;
    } catch (error) {
      console.error('Error in logo upload process:', error);
      return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name) {
      toast.error("اسم الشركة مطلوب");
      return;
    }

    setIsSubmitting(true);
    try {
      const logoUrl = await uploadLogo();
      
      const companyData = {
        name,
        description: description || null,
        address: address || null,
        contact_email: contactEmail || null,
        contact_phone: contactPhone || null,
        logo_url: logoUrl
      };

      if (company?.id) {
        await updateCompany(company.id, companyData);
        toast.success("تم تحديث الشركة بنجاح");
      } else {
        await createCompany(companyData);
        toast.success("تم إضافة الشركة بنجاح");
      }
      
      onSaved();
    } catch (error) {
      console.error('Error saving company:', error);
      toast.error("حدث خطأ أثناء حفظ الشركة");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="name">اسم الشركة *</Label>
        <Input 
          id="name" 
          value={name} 
          onChange={(e) => setName(e.target.value)} 
          placeholder="أدخل اسم الشركة"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="logo">شعار الشركة</Label>
        <div 
          className={`h-40 border-2 border-dashed rounded-md overflow-hidden flex items-center justify-center cursor-pointer ${!logoPreview ? 'bg-gray-50' : ''}`}
          onClick={handleLogoClick}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {logoPreview ? (
            <img src={logoPreview} alt="Company logo preview" className="h-full w-full object-contain" />
          ) : (
            <div className="flex flex-col items-center p-4 text-gray-500">
              <ImageIcon className="w-12 h-12 mb-2" />
              <p className="text-sm text-center">انقر لاختيار صورة أو اسحب وأفلت هنا</p>
              <p className="text-xs text-center mt-1">JPG, PNG (الحد الأقصى 5 ميجابايت)</p>
            </div>
          )}
          <input 
            type="file" 
            id="logo" 
            className="hidden" 
            ref={fileInputRef}
            accept="image/*"
            onChange={handleLogoChange}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">وصف الشركة</Label>
        <Textarea 
          id="description" 
          value={description} 
          onChange={(e) => setDescription(e.target.value)} 
          placeholder="وصف مختصر للشركة"
          rows={3}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="contactEmail">البريد الإلكتروني</Label>
          <Input 
            id="contactEmail" 
            type="email"
            value={contactEmail} 
            onChange={(e) => setContactEmail(e.target.value)} 
            placeholder="البريد الإلكتروني للشركة"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contactPhone">رقم الهاتف</Label>
          <Input 
            id="contactPhone" 
            value={contactPhone} 
            onChange={(e) => setContactPhone(e.target.value)} 
            placeholder="رقم هاتف الشركة"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="address">العنوان</Label>
        <Input 
          id="address" 
          value={address} 
          onChange={(e) => setAddress(e.target.value)} 
          placeholder="عنوان الشركة"
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button 
          type="button" 
          variant="outline" 
          onClick={onCancel}
        >
          إلغاء
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              جاري الحفظ...
            </>
          ) : company?.id ? "تحديث الشركة" : "إضافة الشركة"}
        </Button>
      </div>
    </form>
  );
}
