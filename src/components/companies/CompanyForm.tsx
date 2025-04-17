import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ImagePlus } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { updateCompany, createCompany, Company } from "@/services/supabase/companyService";

interface CompanyFormProps {
  company?: Company;
  onSaved: () => void;
  onCancel: () => void;
}

const CompanyForm = ({
  company,
  onSaved,
  onCancel,
}: CompanyFormProps) => {
  const [name, setName] = useState(company?.name || "");
  const [description, setDescription] = useState(company?.description || "");
  const [address, setAddress] = useState(company?.address || "");
  const [contactEmail, setContactEmail] = useState(company?.contact_email || "");
  const [contactPhone, setContactPhone] = useState(company?.contact_phone || "");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(company?.logo_url || null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (company) {
      setName(company.name || "");
      setDescription(company.description || "");
      setAddress(company.address || "");
      setContactEmail(company.contact_email || "");
      setContactPhone(company.contact_phone || "");
      setLogoPreview(company.logo_url || null);
    }
  }, [company]);

  const uploadLogo = async (file: File) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
    const filePath = `companies/${fileName}`;

    try {
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('images')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('images')
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (error) {
      console.error('Error uploading logo:', error);
      throw error;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);

      let logo_url = company?.logo_url || null;
      if (logoFile) {
        logo_url = await uploadLogo(logoFile);
      }

      const companyData = {
        name,
        description: description || null,
        address: address || null,
        contact_email: contactEmail || null,
        contact_phone: contactPhone || null,
        logo_url: logo_url
      };

      if (company) {
        await updateCompany(company.id, companyData);
        toast.success("تم تحديث الشركة بنجاح");
      } else {
        await createCompany(companyData);
        toast.success("تم إضافة الشركة بنجاح");
      }

      onSaved();
    } catch (error) {
      console.error('Error saving company:', error);
      toast.error("حدث خطأ أثناء حفظ بيانات الشركة");
    } finally {
      setLoading(false);
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      // Create image preview
      const reader = new FileReader();
      reader.onload = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{company ? "تعديل الشركة" : "إضافة شركة جديدة"}</CardTitle>
          <CardDescription>
            {company ? "تعديل بيانات الشركة" : "إضافة بيانات الشركة الجديدة"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="name">اسم الشركة</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="أدخل اسم الشركة"
              required
            />
          </div>
          <div>
            <Label htmlFor="description">الوصف (اختياري)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="أدخل وصف الشركة"
            />
          </div>
          <div>
            <Label htmlFor="address">العنوان (اختياري)</Label>
            <Input
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="أدخل عنوان الشركة"
            />
          </div>
          <div>
            <Label htmlFor="contact_email">البريد الإلكتروني (اختياري)</Label>
            <Input
              id="contact_email"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="أدخل البريد الإلكتروني"
            />
          </div>
          <div>
            <Label htmlFor="contact_phone">رقم الهاتف (اختياري)</Label>
            <Input
              id="contact_phone"
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="أدخل رقم الهاتف"
            />
          </div>
          <div>
            <Label htmlFor="logo">شعار الشركة (اختياري)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="logo"
                type="file"
                accept="image/*"
                onChange={handleLogoChange}
                className="flex-1"
              />
              {logoPreview && (
                <div className="w-12 h-12 rounded overflow-hidden border">
                  <img
                    src={logoPreview}
                    alt="Logo Preview"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onCancel}>
            إلغاء
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                جاري الحفظ...
              </>
            ) : (
              "حفظ"
            )}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
};

export default CompanyForm;
