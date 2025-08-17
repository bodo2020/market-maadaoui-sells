-- إنشاء جدول التفاعلات مع العملاء
CREATE TABLE public.customer_interactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('call', 'email', 'meeting', 'note')),
  subject TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  scheduled_at TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- إنشاء جدول العملاء المحتملين
CREATE TABLE public.leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'proposal', 'closed_won', 'closed_lost')),
  score INTEGER DEFAULT 50 CHECK (score >= 0 AND score <= 100),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- تفعيل RLS للجداول
ALTER TABLE public.customer_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- إنشاء سياسات RLS للتفاعلات
CREATE POLICY "Admins can manage all customer interactions" 
ON public.customer_interactions 
FOR ALL 
USING (is_admin() OR is_super_admin());

CREATE POLICY "Users can view customer interactions" 
ON public.customer_interactions 
FOR SELECT 
USING (true);

-- إنشاء سياسات RLS للعملاء المحتملين
CREATE POLICY "Admins can manage all leads" 
ON public.leads 
FOR ALL 
USING (is_admin() OR is_super_admin());

CREATE POLICY "Users can view leads" 
ON public.leads 
FOR SELECT 
USING (true);

-- إنشاء trigger للتحديث التلقائي للوقت
CREATE TRIGGER update_customer_interactions_updated_at
BEFORE UPDATE ON public.customer_interactions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_leads_updated_at
BEFORE UPDATE ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- إنشاء فهارس لتحسين الأداء
CREATE INDEX idx_customer_interactions_customer_id ON public.customer_interactions(customer_id);
CREATE INDEX idx_customer_interactions_type ON public.customer_interactions(type);
CREATE INDEX idx_customer_interactions_status ON public.customer_interactions(status);
CREATE INDEX idx_customer_interactions_created_at ON public.customer_interactions(created_at DESC);

CREATE INDEX idx_leads_status ON public.leads(status);
CREATE INDEX idx_leads_score ON public.leads(score DESC);
CREATE INDEX idx_leads_created_at ON public.leads(created_at DESC);