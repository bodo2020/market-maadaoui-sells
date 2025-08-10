-- TEMPORARY policies to unblock UI until Supabase Auth is wired for admin role checks
-- WARNING: These make branches and user_branch_roles writable by anyone with access to the API. Replace with proper auth ASAP.

-- Branches: allow all operations
DROP POLICY IF EXISTS "Temporary public manage branches" ON public.branches;
CREATE POLICY "Temporary public manage branches"
ON public.branches
FOR ALL
USING (true)
WITH CHECK (true);

-- User-Branch roles: allow all operations
DROP POLICY IF EXISTS "Temporary public manage user_branch_roles" ON public.user_branch_roles;
CREATE POLICY "Temporary public manage user_branch_roles"
ON public.user_branch_roles
FOR ALL
USING (true)
WITH CHECK (true);
