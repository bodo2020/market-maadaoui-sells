import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { analyticsData, analysisType } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log('Analyzing data type:', analysisType);

    // Create a comprehensive prompt based on the data
    let prompt = '';
    
    if (analysisType === 'products') {
      prompt = `أنت خبير تحليل بيانات متخصص في تجارة التجزئة. قم بتحليل بيانات المبيعات التالية وقدم توصيات محددة وقابلة للتنفيذ:

${JSON.stringify(analyticsData, null, 2)}

يجب أن يتضمن التحليل:

📊 **تحليل المنتجات الأكثر مبيعاً:**
- حدد أفضل 5 منتجات من حيث الإيرادات والكميات
- احسب معدل النمو لكل منتج مقارنة بالفترة السابقة

🔮 **توقعات الطلب والمخزون:**
- حدد المنتجات التي تحتاج زيادة في الكميات المخزنة (بناءً على معدل البيع وسرعة الدوران)
- اذكر الكمية المقترحة بالأرقام لكل منتج
- حدد المنتجات بطيئة الحركة التي يجب تقليل مخزونها أو عمل عروض عليها

💰 **تحسين الأرباح:**
- المنتجات ذات هامش الربح الأعلى التي يجب التركيز عليها
- المنتجات ذات هامش الربح المنخفض التي تحتاج مراجعة الأسعار

📈 **اتجاهات البيع:**
- حدد أنماط البيع (أيام/أوقات الذروة)
- توصيات لتحسين الأداء

اجعل الإجابة مختصرة ومباشرة مع أرقام محددة.`;
    } else if (analysisType === 'customers') {
      prompt = `أنت خبير في تحليل سلوك العملاء. قم بتحليل البيانات التالية:

${JSON.stringify(analyticsData, null, 2)}

قدم تحليل شامل يتضمن:

👥 **تصنيف العملاء:**
- حدد أفضل 10 عملاء من حيث القيمة الشرائية
- العملاء الأكثر ولاءً (تكرار الشراء)
- العملاء الجدد مقابل العملاء المتكررين

💡 **رؤى سلوكية:**
- متوسط قيمة الطلب لكل شريحة
- معدل تكرار الشراء
- المنتجات الأكثر شعبية لكل شريحة

📢 **توصيات تسويقية:**
- شرائح العملاء التي تحتاج حملات استهداف
- أفكار لبرامج الولاء
- اقتراحات لزيادة قيمة الطلب

اجعل التحليل عملياً ومباشراً.`;
    } else if (analysisType === 'revenue') {
      prompt = `أنت خبير مالي متخصص في تحليل الإيرادات والأرباح. قم بتحليل البيانات المالية التالية:

${JSON.stringify(analyticsData, null, 2)}

يجب أن يشمل التحليل:

💵 **تحليل الإيرادات والأرباح:**
- إجمالي الإيرادات وصافي الأرباح
- هامش الربح الإجمالي والصافي
- مقارنة مع الفترات السابقة (نسبة النمو/التراجع)

📊 **توزيع الإيرادات:**
- مصادر الإيرادات الرئيسية
- أكثر فترات العام ربحية
- الاتجاهات الموسمية

💰 **اقتراحات ميزانية الإعلانات:**
- احسب النسبة المثالية من صافي الربح التي يجب تخصيصها للإعلانات (عادة 5-15%)
- حدد رقم محدد بالجنيه المصري للإنفاق الإعلاني المقترح
- أفضل القنوات الإعلانية بناءً على البيانات

🎯 **توصيات لزيادة الأرباح:**
- فرص لزيادة الإيرادات
- طرق لتحسين هامش الربح
- استراتيجيات تسعير

كن محدداً بالأرقام والنسب المئوية.`;
    } else if (analysisType === 'expenses') {
      prompt = `أنت خبير في إدارة المصروفات والتكاليف. قم بتحليل بيانات المصروفات التالية:

${JSON.stringify(analyticsData, null, 2)}

قدم تحليل شامل يتضمن:

💸 **تحليل المصروفات:**
- إجمالي المصروفات وتوزيعها حسب الفئات
- أكبر 5 بنود مصروفات
- نسبة كل بند من إجمالي المصروفات

📉 **فرص التوفير:**
- حدد المصروفات التي يمكن تخفيضها (اذكر النسبة المحتملة)
- المصروفات الزائدة أو غير الضرورية
- بدائل أقل تكلفة

⚖️ **تحليل الكفاءة:**
- نسبة المصروفات من الإيرادات
- مقارنة بالمعايير القياسية للقطاع
- المصروفات المتغيرة مقابل الثابتة

💡 **توصيات الميزانية:**
- اقترح ميزانية مثالية لكل فئة مصروفات
- أولويات الإنفاق
- خطة لتحسين الكفاءة المالية

📢 **ميزانية الإعلانات المقترحة:**
- احسب المبلغ الأمثل للإنفاق الإعلاني بناءً على الأرباح
- حدد رقم محدد بالجنيه المصري
- اقترح نسبة مئوية من صافي الربح (عادة 5-15%)

كن محدداً بالأرقام والمبالغ المقترحة.`;
    } else {
      prompt = `قم بتحليل البيانات التجارية التالية وقدم رؤى شاملة وتوصيات قابلة للتنفيذ:

${JSON.stringify(analyticsData, null, 2)}

قدم تحليل شامل مع توصيات محددة لتحسين الأداء التجاري.`;
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'أنت خبير تحليلات أعمال متخصص في تجارة التجزئة والتحليل المالي. قدم رؤى واضحة وقابلة للتنفيذ مع أرقام وتوصيات محددة. استخدم الرموز التعبيرية لتنظيم الإجابة. كن مختصراً ومباشراً ومحدداً بالأرقام.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.8,
        max_tokens: 2000
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'تم تجاوز الحد المسموح، يرجى المحاولة لاحقاً' }), 
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'يرجى إضافة رصيد إلى حساب Lovable AI' }), 
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const insights = data.choices[0].message.content;

    console.log('Analysis completed successfully');

    return new Response(
      JSON.stringify({ insights }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in analyze-data function:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'حدث خطأ في التحليل' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
