-- Master/sub administrator migration for SmallTalK Project.
-- Run this once in the Supabase SQL Editor for an existing project.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('student', 'teacher', 'sub_teacher'));

CREATE TABLE IF NOT EXISTS public.invite_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  invite_type TEXT NOT NULL CHECK (invite_type IN ('student', 'sub_teacher')),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  used_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS invite_codes_owner_idx
  ON public.invite_codes(owner_id, invite_type, created_at DESC);

CREATE INDEX IF NOT EXISTS profiles_manager_idx
  ON public.profiles(manager_id, role);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.current_user_is_active()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_active FROM public.profiles WHERE id = auth.uid()), FALSE);
$$;

CREATE OR REPLACE FUNCTION public.can_manage_student(p_student_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles actor
    JOIN public.profiles student ON student.id = p_student_id
    WHERE actor.id = auth.uid()
      AND actor.is_active = TRUE
      AND student.role = 'student'
      AND (
        actor.role = 'teacher'
        OR (actor.role = 'sub_teacher' AND student.manager_id = actor.id)
      )
  );
$$;

DROP POLICY IF EXISTS "student_view_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "teacher_view_all_profiles" ON public.profiles;
DROP POLICY IF EXISTS "user_insert_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "user_update_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_self" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_master_all" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_sub_teacher_students" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own_student" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_master_sub_teachers" ON public.profiles;

CREATE POLICY "profiles_select_self"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles_select_master_all"
  ON public.profiles FOR SELECT
  USING (
    public.current_user_role() = 'teacher'
    AND public.current_user_is_active() = TRUE
  );

CREATE POLICY "profiles_select_sub_teacher_students"
  ON public.profiles FOR SELECT
  USING (
    role = 'student'
    AND manager_id = auth.uid()
    AND public.current_user_role() = 'sub_teacher'
    AND public.current_user_is_active() = TRUE
  );

CREATE POLICY "profiles_insert_own_student"
  ON public.profiles FOR INSERT
  WITH CHECK (
    auth.uid() = id
    AND role = 'student'
    AND manager_id IS NULL
    AND is_active = TRUE
  );

CREATE POLICY "profiles_update_self"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_master_sub_teachers"
  ON public.profiles FOR UPDATE
  USING (
    role = 'sub_teacher'
    AND manager_id = auth.uid()
    AND public.current_user_role() = 'teacher'
    AND public.current_user_is_active() = TRUE
  )
  WITH CHECK (
    role = 'sub_teacher'
    AND manager_id = auth.uid()
  );

CREATE OR REPLACE FUNCTION public.guard_profile_sensitive_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_role TEXT;
  actor_active BOOLEAN;
BEGIN
  SELECT role, is_active
  INTO actor_role, actor_active
  FROM public.profiles
  WHERE id = auth.uid();

  IF auth.uid() = OLD.id THEN
    NEW.role := OLD.role;
    NEW.manager_id := OLD.manager_id;
    NEW.is_active := OLD.is_active;
  ELSIF actor_role = 'teacher' AND actor_active = TRUE AND OLD.role = 'sub_teacher' THEN
    NEW.role := OLD.role;
    NEW.manager_id := OLD.manager_id;
  ELSE
    NEW.role := OLD.role;
    NEW.manager_id := OLD.manager_id;
    NEW.is_active := OLD.is_active;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_sensitive_fields_trigger ON public.profiles;
CREATE TRIGGER guard_profile_sensitive_fields_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profile_sensitive_fields();

DROP POLICY IF EXISTS "student_view_own_logs" ON public.activity_logs;
DROP POLICY IF EXISTS "student_insert_own_logs" ON public.activity_logs;
DROP POLICY IF EXISTS "teacher_view_all_logs" ON public.activity_logs;
DROP POLICY IF EXISTS "activity_logs_select_self" ON public.activity_logs;
DROP POLICY IF EXISTS "activity_logs_select_master_all" ON public.activity_logs;
DROP POLICY IF EXISTS "activity_logs_select_sub_teacher_students" ON public.activity_logs;
DROP POLICY IF EXISTS "activity_logs_select_teacher_managed" ON public.activity_logs;
DROP POLICY IF EXISTS "activity_logs_insert_own_student" ON public.activity_logs;

CREATE POLICY "activity_logs_select_self"
  ON public.activity_logs FOR SELECT
  USING (auth.uid() = student_id);

CREATE POLICY "activity_logs_select_teacher_managed"
  ON public.activity_logs FOR SELECT
  USING (public.can_manage_student(student_id));

CREATE POLICY "activity_logs_insert_own_student"
  ON public.activity_logs FOR INSERT
  WITH CHECK (
    auth.uid() = student_id
    AND EXISTS (
      SELECT 1 FROM public.profiles student
      WHERE student.id = auth.uid()
        AND student.role = 'student'
        AND student.is_active = TRUE
    )
  );

DROP POLICY IF EXISTS "invite_codes_select_owner" ON public.invite_codes;
DROP POLICY IF EXISTS "invite_codes_update_owner" ON public.invite_codes;

CREATE POLICY "invite_codes_select_owner"
  ON public.invite_codes FOR SELECT
  USING (
    owner_id = auth.uid()
    AND public.current_user_role() IN ('teacher', 'sub_teacher')
    AND public.current_user_is_active() = TRUE
  );

CREATE POLICY "invite_codes_update_owner"
  ON public.invite_codes FOR UPDATE
  USING (
    owner_id = auth.uid()
    AND used_at IS NULL
    AND public.current_user_role() IN ('teacher', 'sub_teacher')
    AND public.current_user_is_active() = TRUE
  )
  WITH CHECK (owner_id = auth.uid());

CREATE OR REPLACE FUNCTION public.create_invite_code(p_invite_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_role TEXT;
  actor_active BOOLEAN;
  new_code TEXT;
BEGIN
  SELECT role, is_active
  INTO actor_role, actor_active
  FROM public.profiles
  WHERE id = auth.uid();

  IF actor_active IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Active administrator profile is required.';
  END IF;

  IF p_invite_type = 'sub_teacher' AND actor_role <> 'teacher' THEN
    RAISE EXCEPTION 'Only master administrators can invite sub administrators.';
  END IF;

  IF p_invite_type = 'student' AND actor_role NOT IN ('teacher', 'sub_teacher') THEN
    RAISE EXCEPTION 'Only administrators can create student registration codes.';
  END IF;

  IF p_invite_type NOT IN ('student', 'sub_teacher') THEN
    RAISE EXCEPTION 'Unsupported invite type.';
  END IF;

  LOOP
    new_code := UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', '') FROM 1 FOR 10));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.invite_codes WHERE code = new_code
    );
  END LOOP;

  INSERT INTO public.invite_codes (code, invite_type, owner_id)
  VALUES (new_code, p_invite_type, auth.uid());

  RETURN new_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.redeem_invite_code(
  p_code TEXT,
  p_name TEXT,
  p_class_name TEXT DEFAULT NULL,
  p_student_number INT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite public.invite_codes%ROWTYPE;
  owner_role TEXT;
  owner_active BOOLEAN;
BEGIN
  SELECT *
  INTO invite
  FROM public.invite_codes
  WHERE code = UPPER(TRIM(p_code))
    AND used_at IS NULL
    AND revoked_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or already used invite code.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'Profile already exists.';
  END IF;

  SELECT role, is_active
  INTO owner_role, owner_active
  FROM public.profiles
  WHERE id = invite.owner_id;

  IF owner_active IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Invite owner is inactive.';
  END IF;

  IF invite.invite_type = 'sub_teacher' THEN
    IF owner_role <> 'teacher' THEN
      RAISE EXCEPTION 'Invalid sub administrator invite owner.';
    END IF;

    INSERT INTO public.profiles (id, name, role, manager_id, is_active)
    VALUES (auth.uid(), NULLIF(TRIM(p_name), ''), 'sub_teacher', invite.owner_id, TRUE);
  ELSIF invite.invite_type = 'student' THEN
    IF owner_role NOT IN ('teacher', 'sub_teacher') THEN
      RAISE EXCEPTION 'Invalid student invite owner.';
    END IF;

    IF p_class_name IS NULL OR p_student_number IS NULL OR p_student_number < 1 OR p_student_number > 50 THEN
      RAISE EXCEPTION 'Valid class and student number are required.';
    END IF;

    INSERT INTO public.profiles (id, name, role, class_name, student_number, manager_id, is_active)
    VALUES (auth.uid(), NULLIF(TRIM(p_name), ''), 'student', p_class_name, p_student_number, invite.owner_id, TRUE);
  ELSE
    RAISE EXCEPTION 'Unsupported invite type.';
  END IF;

  UPDATE public.invite_codes
  SET used_by = auth.uid(),
      used_at = NOW()
  WHERE id = invite.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_invite_code(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_invite_code(TEXT, TEXT, TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_is_active() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_student(UUID) TO authenticated;
