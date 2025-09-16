-- إنشاء جدول الرواتب
CREATE TABLE public.salaries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL DEFAULT 0,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL CHECK (year >= 2020),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('paid', 'pending')),
  payment_date DATE,
  notes TEXT,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- منع إضافة راتب مكرر لنفس الموظف في نفس الشهر والسنة
  UNIQUE(employee_id, month, year)
);

-- تفعيل Row Level Security
ALTER TABLE public.salaries ENABLE ROW LEVEL SECURITY;

-- إنشاء سياسات الأمان
CREATE POLICY "Admins can manage all salaries" 
ON public.salaries 
FOR ALL 
USING (is_admin() OR is_super_admin());

CREATE POLICY "Users can view their own salary" 
ON public.salaries 
FOR SELECT 
USING (employee_id = auth.uid());

-- إنشاء trigger لتحديث updated_at
CREATE TRIGGER update_salaries_updated_at
BEFORE UPDATE ON public.salaries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- إنشاء فهرس لتحسين الأداء
CREATE INDEX idx_salaries_employee_id ON public.salaries(employee_id);
CREATE INDEX idx_salaries_month_year ON public.salaries(month, year);
CREATE INDEX idx_salaries_status ON public.salaries(status);