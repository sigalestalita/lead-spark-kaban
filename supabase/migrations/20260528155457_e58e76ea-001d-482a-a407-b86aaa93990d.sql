CREATE POLICY digests_auth_update ON public.weekly_digests
  FOR UPDATE TO authenticated
  USING (status <> 'sent') WITH CHECK (status <> 'sent');

GRANT UPDATE ON public.weekly_digests TO authenticated;