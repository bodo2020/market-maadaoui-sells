-- Allow admins to view all return requests so the dashboard counts and Returns page can include online requests
CREATE POLICY IF NOT EXISTS "Admins can view all return requests"
ON public.return_requests
FOR SELECT
USING (is_admin() OR is_super_admin());