
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log("Creating Supabase client with service role key")
    
    // Create a Supabase client with service role key (not auth context)
    const supabaseAdmin = createClient(
      // Supabase API URL - env var exported by default
      Deno.env.get('SUPABASE_URL') ?? '',
      // Supabase SERVICE_ROLE_KEY - env var exported by default
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        global: {
          headers: { 'X-Client-Info': 'create-banners-bucket-function' },
        },
      }
    )

    console.log("Checking if banners bucket exists...")
    
    // Check if the bucket exists
    const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets()
    
    if (listError) {
      console.error("Error listing buckets:", listError)
      throw listError
    }

    const bannersBucketExists = buckets.some(bucket => bucket.name === 'banners')
    
    if (!bannersBucketExists) {
      console.log("Banners bucket doesn't exist. Creating now...")
      // Create the banners bucket if it doesn't exist
      const { error: createError } = await supabaseAdmin.storage.createBucket('banners', {
        public: true,
        fileSizeLimit: 10485760, // 10MB
      })
      
      if (createError) {
        console.error("Error creating bucket:", createError)
        throw createError
      }
      
      console.log("Creating public policy for banners bucket...")
      // Add policy to make the bucket public for uploads and downloads
      try {
        const { data, error: policyError } = await supabaseAdmin.storage.from('banners').getPublicUrl('test');
        if (policyError) {
          console.error("Error creating public URL (expected if bucket is new):", policyError);
        }
        
        // Create policy for downloads
        const { error: downloadPolicyError } = await supabaseAdmin.rpc('create_storage_policy', {
          bucket_name: 'banners',
          policy_name: 'Public Download',
          definition: {
            name: 'Public Download',
            action: 'download',
            allow_access: true
          }
        });
        
        if (downloadPolicyError) {
          console.error("Error creating download policy:", downloadPolicyError);
          // Continue anyway, don't throw
        }
        
        // Create policy for uploads
        const { error: uploadPolicyError } = await supabaseAdmin.rpc('create_storage_policy', {
          bucket_name: 'banners',
          policy_name: 'Public Upload',
          definition: {
            name: 'Public Upload',
            action: 'upload',
            allow_access: true
          }
        });
        
        if (uploadPolicyError) {
          console.error("Error creating upload policy:", uploadPolicyError);
          // Continue anyway, don't throw
        }
        
      } catch (policyError) {
        console.error("Error setting policies:", policyError);
        // Continue anyway, don't throw
      }
      
      console.log("Banners bucket and policies created successfully");
    } else {
      console.log("Banners bucket already exists");
      
      // Even if bucket exists, make sure policies are set correctly
      try {
        console.log("Verifying public policies for existing bucket...");
        
        // Create policy for downloads if needed
        const { error: downloadPolicyError } = await supabaseAdmin.rpc('create_storage_policy', {
          bucket_name: 'banners',
          policy_name: 'Public Download',
          definition: {
            name: 'Public Download',
            action: 'download',
            allow_access: true
          }
        });
        
        if (downloadPolicyError && !downloadPolicyError.message.includes('already exists')) {
          console.error("Error creating download policy:", downloadPolicyError);
        }
        
        // Create policy for uploads if needed
        const { error: uploadPolicyError } = await supabaseAdmin.rpc('create_storage_policy', {
          bucket_name: 'banners',
          policy_name: 'Public Upload',
          definition: {
            name: 'Public Upload',
            action: 'upload',
            allow_access: true
          }
        });
        
        if (uploadPolicyError && !uploadPolicyError.message.includes('already exists')) {
          console.error("Error creating upload policy:", uploadPolicyError);
        }
      } catch (policyError) {
        console.error("Error verifying policies:", policyError);
        // Continue anyway, don't throw
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Banners bucket is ready',
        bucket_exists: bannersBucketExists
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error("Function error:", error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
