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
      prompt = `Analyze this product sales data and provide actionable insights:
${JSON.stringify(analyticsData, null, 2)}

Provide:
1. Top performing products analysis
2. Underperforming products that need attention
3. Pricing optimization suggestions
4. Inventory recommendations
5. Sales trends and patterns

Keep the response concise but informative in Arabic.`;
    } else if (analysisType === 'customers') {
      prompt = `Analyze this customer data and provide actionable insights:
${JSON.stringify(analyticsData, null, 2)}

Provide:
1. Customer behavior patterns
2. High-value customer segments
3. Customer retention insights
4. Marketing recommendations
5. Growth opportunities

Keep the response concise but informative in Arabic.`;
    } else if (analysisType === 'revenue') {
      prompt = `Analyze this revenue and profit data and provide actionable insights:
${JSON.stringify(analyticsData, null, 2)}

Provide:
1. Revenue trends analysis
2. Profit margin insights
3. Cost optimization opportunities
4. Revenue growth recommendations
5. Financial health assessment

Keep the response concise but informative in Arabic.`;
    } else if (analysisType === 'expenses') {
      prompt = `Analyze this expense data and provide actionable insights:
${JSON.stringify(analyticsData, null, 2)}

Provide:
1. Expense patterns and trends
2. Cost-saving opportunities
3. Budget optimization recommendations
4. Expense category analysis
5. Financial efficiency suggestions

Keep the response concise but informative in Arabic.`;
    } else {
      prompt = `Analyze this business data and provide comprehensive insights:
${JSON.stringify(analyticsData, null, 2)}

Provide actionable recommendations to improve business performance in Arabic.`;
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
            content: 'You are a business analytics expert. Provide clear, actionable insights based on the data. Always respond in Arabic.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1500
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
