
-- Trigger no auth.users para popular profile + user_roles
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill: garante profile para quem já está em auth.users
INSERT INTO public.profiles (id, email, full_name)
SELECT u.id, u.email, COALESCE(u.raw_user_meta_data->>'full_name', u.email)
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
  AND u.email ILIKE '%@grougp.com.br';

-- Backfill: Talita como super_admin
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'super_admin'::public.app_role
FROM auth.users u
WHERE LOWER(u.email) = 'talita.sigales@grougp.com.br'
ON CONFLICT (user_id, role) DO NOTHING;

-- Backfill: demais usuários @grougp sem papel viram sdr
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'sdr'::public.app_role
FROM auth.users u
LEFT JOIN public.user_roles ur ON ur.user_id = u.id
WHERE ur.user_id IS NULL
  AND u.email ILIKE '%@grougp.com.br'
  AND LOWER(u.email) <> 'talita.sigales@grougp.com.br'
ON CONFLICT (user_id, role) DO NOTHING;
