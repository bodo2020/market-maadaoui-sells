
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type StatusFilterProps = {
  value: string;
  onChange: (value: string) => void;
};

export default function StatusFilter({ value, onChange }: StatusFilterProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="تصفية حسب الحالة" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">الكل</SelectItem>
        <SelectItem value="available">متوفر</SelectItem>
        <SelectItem value="low">مخزون منخفض</SelectItem>
        <SelectItem value="out">غير متوفر</SelectItem>
      </SelectContent>
    </Select>
  );
}
