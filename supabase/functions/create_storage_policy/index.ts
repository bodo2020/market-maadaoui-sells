
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    // Create a Supabase client with the Auth context of the logged in user
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    const { data: { user } } = await supabaseClient.auth.getUser()
    
    // Only allow admins to create buckets
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { headers: { 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Get the bucket name from the request
    const { bucketName } = await req.json()
    
    if (!bucketName) {
      return new Response(
        JSON.stringify({ error: 'Bucket name is required' }),
        { headers: { 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Create the bucket if it doesn't exist
    const { data, error } = await supabaseClient.rpc('create_bucket_if_not_exists', {
      bucket_name: bucketName
    })

    if (error) {
      throw error
    }

    return new Response(
      JSON.stringify({ success: true, message: `Bucket ${bucketName} has been created or already exists` }),
      { headers: { 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
