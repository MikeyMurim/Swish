-- Allows users to read back their own check-in history (previously write-only).
-- Needed for the Profile page's "Recent Courts" section.
CREATE POLICY "Users can view their own check-ins" ON sessions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
