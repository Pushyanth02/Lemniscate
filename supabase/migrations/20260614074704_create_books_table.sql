CREATE TABLE public.books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  author text,
  description text,
  genre text NOT NULL DEFAULT 'other',
  status text NOT NULL DEFAULT 'ready',
  total_chapters integer NOT NULL DEFAULT 0,
  processed_chapters integer NOT NULL DEFAULT 0,
  total_word_count integer NOT NULL DEFAULT 0,
  is_public boolean NOT NULL DEFAULT false,
  file_url text,
  error_message text,
  chapters jsonb NOT NULL DEFAULT '[]'::jsonb,
  characters jsonb,
  entity_registry jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX books_user_id_idx ON public.books (user_id);
CREATE INDEX books_created_at_idx ON public.books (created_at DESC);

ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;

-- Users can only see their own books
CREATE POLICY "books: select own" ON public.books
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own books
CREATE POLICY "books: insert own" ON public.books
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own books
CREATE POLICY "books: update own" ON public.books
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own books
CREATE POLICY "books: delete own" ON public.books
  FOR DELETE USING (auth.uid() = user_id);

-- Reuse the handle_updated_at trigger function from the users migration
CREATE TRIGGER books_updated_at
  BEFORE UPDATE ON public.books
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Auto-create a users profile row on first sign-up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.users (auth_id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (auth_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();;
