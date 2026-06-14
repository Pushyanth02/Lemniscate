-- Fix: set stable search_path on handle_updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Fix: revoke public execute on rls_auto_enable
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated;;
