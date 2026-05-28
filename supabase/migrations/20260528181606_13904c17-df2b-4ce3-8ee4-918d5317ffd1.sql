UPDATE public.weekly_digests
SET content_html = REPLACE(content_html, 'https://sdr-grou.lovable.app/lidi-logo-white.png', 'https://vlfohgirjbgpqhqbnuks.supabase.co/storage/v1/object/public/email-assets/lidi-logo-white.png')
WHERE content_html LIKE '%sdr-grou.lovable.app/lidi-logo-white.png%';