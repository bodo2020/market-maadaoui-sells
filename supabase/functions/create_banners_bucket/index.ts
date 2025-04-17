
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
    // Create a Supabase client with the Auth context of the function
    const supabaseClient = createClient(
      // Supabase API URL - env var exported by default.
      Deno.env.get('SUPABASE_URL') ?? '',
      // Supabase API ANON KEY - env var exported by default.
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      // Create client with Auth context of the user that called the function.
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    console.log("Checking if banners bucket exists...")
    
    // Check if the bucket exists
    const { data: buckets, error: listError } = await supabaseClient.storage.listBuckets()
    
    if (listError) {
      console.error("Error listing buckets:", listError)
      throw listError
    }

    const bannersBucketExists = buckets.some(bucket => bucket.name === 'banners')
    
    if (!bannersBucketExists) {
      console.log("Banners bucket doesn't exist. Creating now...")
      // Create the banners bucket if it doesn't exist
      const { error: createError } = await supabaseClient.storage.createBucket('banners', {
        public: true,
        fileSizeLimit: 10485760, // 10MB
      })
      
      if (createError) {
        console.error("Error creating bucket:", createError)
        throw createError
      }
      
      console.log("Creating public policy for banners bucket...")
      // Add a policy to make the bucket public
      const { error: policyError } = await supabaseClient.rpc('create_storage_policy', {
        bucket_name: 'banners',
        policy_name: 'Public Access',
        definition: {
          name: 'Public Access',
          allow_upload: true,
          allow_download: true
        }
      })
      
      if (policyError) {
        console.error("Error creating policy:", policyError)
        throw policyError
      }
      
      console.log("Banners bucket and policy created successfully")
    } else {
      console.log("Banners bucket already exists")
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Banners bucket is ready' }),
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
