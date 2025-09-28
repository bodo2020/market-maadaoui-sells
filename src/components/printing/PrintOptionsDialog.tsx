import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Printer, FileText, Receipt, Smartphone } from 'lucide-react';
import { Card, CardContent } from "@/components/ui/card";

export type PrintType = 'thermal' | 'standard';

interface PrintOptionsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onPrintSelected: (type: PrintType) => void;
  title?: string;
  description?: string;
}

export const PrintOptionsDialog: React.FC<PrintOptionsDialogProps> = ({
  isOpen,
  onClose,
  onPrintSelected,
  title = "اختيار نوع الطباعة",
  description = "اختر نوع الطباعة المناسب"
}) => {
  const [selectedType, setSelectedType] = React.useState<PrintType>('thermal');

  const handlePrint = () => {
    onPrintSelected(selectedType);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{description}</p>
          
          <RadioGroup
            value={selectedType}
            onValueChange={(value) => setSelectedType(value as PrintType)}
            className="space-y-3"
          >
            <Card className="cursor-pointer hover:bg-accent/50 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-center space-x-2 space-x-reverse">
                  <RadioGroupItem value="thermal" id="thermal" />
                  <Label htmlFor="thermal" className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Receipt className="h-5 w-5 text-primary" />
                        <Smartphone className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="font-medium">إيصال حراري 58 مم</div>
                        <div className="text-sm text-muted-foreground">
                          مناسب للطابعات الحرارية والأجهزة المحمولة
                        </div>
                      </div>
                    </div>
                  </Label>
                </div>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:bg-accent/50 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-center space-x-2 space-x-reverse">
                  <RadioGroupItem value="standard" id="standard" />
                  <Label htmlFor="standard" className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-primary" />
                      <div>
                        <div className="font-medium">فاتورة عادية A4</div>
                        <div className="text-sm text-muted-foreground">
                          مناسبة للطابعات العادية والفواتير الرسمية
                        </div>
                      </div>
                    </div>
                  </Label>
                </div>
              </CardContent>
            </Card>
          </RadioGroup>

          <div className="flex gap-2 pt-4">
            <Button onClick={handlePrint} className="flex-1">
              <Printer className="h-4 w-4 ml-2" />
              طباعة
            </Button>
            <Button variant="outline" onClick={onClose} className="flex-1">
              إلغاء
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};