-- ================================================================
--  체육 활동 기록부 - Supabase SQL Setup
--  Supabase 대시보드 → SQL Editor 에서 아래 전체를 복사 붙여넣기 후 실행
-- ================================================================

-- 1. 사용자 프로필 테이블
CREATE TABLE IF NOT EXISTS public.profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('student', 'teacher')),
  class_name      TEXT,         -- 학생: '1반'~'10반', 교사: NULL
  student_number  INT,          -- 학생: 번호, 교사: NULL
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 활동 기록 테이블
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content      TEXT NOT NULL,
  tags         TEXT[] NOT NULL DEFAULT '{}',
  recorded_at  TIMESTAMPTZ DEFAULT NOW(),  -- 제출 시 클라이언트 실시간 시각 저장
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 기존에 만든 프로젝트라면 태그 컬럼만 추가됩니다.
ALTER TABLE public.activity_logs
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

-- 3. Row Level Security 활성화
ALTER TABLE public.profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- ── profiles 정책 ──────────────────────────────────────────

-- 학생: 본인 프로필만 조회
CREATE POLICY "student_view_own_profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- 교사: 모든 프로필 조회 가능
CREATE POLICY "teacher_view_all_profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'teacher'
    )
  );

-- 신규 가입 시 본인 프로필 insert 허용
CREATE POLICY "user_insert_own_profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ── activity_logs 정책 ─────────────────────────────────────

-- 학생: 본인 기록만 조회
CREATE POLICY "student_view_own_logs"
  ON public.activity_logs FOR SELECT
  USING (auth.uid() = student_id);

-- 학생: 본인 기록만 insert
CREATE POLICY "student_insert_own_logs"
  ON public.activity_logs FOR INSERT
  WITH CHECK (auth.uid() = student_id);

-- 교사: 모든 기록 조회 가능
CREATE POLICY "teacher_view_all_logs"
  ON public.activity_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'teacher'
    )
  );

-- ================================================================
-- [선택] 교사 계정 수동 등록 예시
-- Supabase Authentication 탭에서 먼저 교사 이메일/비밀번호로 계정을 생성한 뒤,
-- 아래 INSERT 에서 해당 계정의 UUID 를 복사해 붙여넣으세요.
-- ================================================================
/*
INSERT INTO public.profiles (id, name, role, class_name, student_number)
VALUES ('여기에-교사-UUID-입력', '홍길동', 'teacher', NULL, NULL);
*/
