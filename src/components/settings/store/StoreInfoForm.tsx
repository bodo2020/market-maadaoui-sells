
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

interface StoreInfoFormProps {
  storeData: {
    storeName: string;
    storeAddress: string;
    storePhone: string;
    storeEmail: string;
  };
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSave: () => void;
  saving: boolean;
}

export default function StoreInfoForm({ storeData, onChange, onSave, saving }: StoreInfoFormProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="storeName">اسم المتجر</Label>
            <Input
              id="storeName"
              name="storeName"
              value={storeData.storeName}
              onChange={onChange}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="storeAddress">عنوان المتجر</Label>
            <Input
              id="storeAddress"
              name="storeAddress"
              value={storeData.storeAddress}
              onChange={onChange}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="storePhone">رقم الهاتف</Label>
            <Input
              id="storePhone"
              name="storePhone"
              value={storeData.storePhone}
              onChange={onChange}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="storeEmail">البريد الإلكتروني</Label>
            <Input
              id="storeEmail"
              name="storeEmail"
              type="email"
              value={storeData.storeEmail}
              onChange={onChange}
            />
          </div>
          
          <Button 
            onClick={onSave} 
            className="w-full"
            disabled={saving}
          >
            {saving ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
