import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

export default function TeacherRegister() {
    const [searchParams] = useSearchParams()
    const [form, setForm] = useState({
        name: '',
        email: '',
        password: '',
        confirmPassword: '',
        invite_code: searchParams.get('code') || '',
    })
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const navigate = useNavigate()

    function handleChange(e) {
        setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
    }

    async function handleRegister(e) {
        e.preventDefault()
        setError('')

        if (form.password !== form.confirmPassword) {
            setError('비밀번호가 일치하지 않습니다.')
            return
        }
        if (!form.invite_code.trim()) {
            setError('마스터관리자가 발급한 초대코드를 입력해 주세요.')
            return
        }

        setLoading(true)

        const { data, error: signUpError } = await supabase.auth.signUp({
            email: form.email,
            password: form.password,
        })

        if (signUpError) {
            setError(signUpError.message)
            setLoading(false)
            return
        }

        if (!data.user?.id) {
            setError('회원가입 중 오류가 발생했습니다. 다시 시도해 주세요.')
            setLoading(false)
            return
        }

        const { error: profileError } = await supabase.rpc('redeem_invite_code', {
            p_code: form.invite_code.trim(),
            p_name: form.name,
            p_class_name: null,
            p_student_number: null,
        })

        if (profileError) {
            setError('관리자 등록 중 오류: ' + profileError.message)
            setLoading(false)
            return
        }

        navigate('/teacher')
    }

    return (
        <div className="auth-container">
            <div className="auth-card">
                <div className="auth-logo">
                    <span className="logo-icon">🏫</span>
                    <h1>관리자 가입</h1>
                    <p>초대코드로 서브관리자 계정을 만드세요</p>
                </div>

                <form onSubmit={handleRegister} className="auth-form">
                    <div className="form-group">
                        <label htmlFor="teacher-name">이름</label>
                        <input
                            id="teacher-name"
                            name="name"
                            type="text"
                            placeholder="이름"
                            value={form.name}
                            onChange={handleChange}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="teacher-invite">초대코드</label>
                        <input
                            id="teacher-invite"
                            name="invite_code"
                            type="text"
                            placeholder="마스터관리자가 발급한 코드"
                            value={form.invite_code}
                            onChange={handleChange}
                            required
                            autoCapitalize="characters"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="teacher-email">이메일</label>
                        <input
                            id="teacher-email"
                            name="email"
                            type="email"
                            placeholder="이메일 주소"
                            value={form.email}
                            onChange={handleChange}
                            required
                            autoComplete="email"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="teacher-password">비밀번호</label>
                        <input
                            id="teacher-password"
                            name="password"
                            type="password"
                            placeholder="6자 이상"
                            minLength={6}
                            value={form.password}
                            onChange={handleChange}
                            required
                            autoComplete="new-password"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="teacher-confirm-password">비밀번호 확인</label>
                        <input
                            id="teacher-confirm-password"
                            name="confirmPassword"
                            type="password"
                            placeholder="비밀번호 재입력"
                            value={form.confirmPassword}
                            onChange={handleChange}
                            required
                            autoComplete="new-password"
                        />
                    </div>

                    {error && <div className="error-msg">{error}</div>}

                    <button type="submit" className="btn-primary" disabled={loading}>
                        {loading ? <span className="btn-spinner" /> : '관리자 가입'}
                    </button>
                </form>

                <div className="auth-footer">
                    <p>이미 계정이 있으신가요? <Link to="/login">로그인</Link></p>
                </div>
            </div>
        </div>
    )
}
