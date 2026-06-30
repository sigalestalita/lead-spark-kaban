CREATE OR REPLACE FUNCTION public.can_access_lead(_lead_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.leads l WHERE l.id = _lead_id)
    AND auth.uid() IS NOT NULL
$function$;