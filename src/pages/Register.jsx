import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Link, useNavigate } from 'react-router-dom'

const CLASSES = Array.from({ length: 10 }, (_, i) => `${i + 1}반`)

export default function Register() {
    const [form, setForm] = useState({
        name: '',
        email: '',
        password: '',
        confirmPassword: '',
        class_name: '1반',
        student_number: '',
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
        if (!form.student_number || isNaN(form.student_number) || Number(form.student_number) < 1) {
            setError('올바른 번호를 입력해 주세요.')
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

        const userId = data.user?.id
        if (!userId) {
            setError('회원가입 중 오류가 발생했습니다. 다시 시도해 주세요.')
            setLoading(false)
            return
        }

        const { error: profileError } = await supabase.from('profiles').insert({
            id: userId,
            name: form.name,
            role: 'student',
            class_name: form.class_name,
            student_number: Number(form.student_number),
        })

        if (profileError) {
            setError('프로필 저장 중 오류: ' + profileError.message)
            setLoading(false)
            return
        }

        navigate('/student')
    }

    return (
        <div className="auth-container">
            <div className="auth-card">
                <div className="auth-logo">
                    <span className="logo-icon">📝</span>
                    <h1>학생 회원가입</h1>
                    <p>정보를 입력하고 계정을 만드세요</p>
                </div>

                <form onSubmit={handleRegister} className="auth-form">
                    <div className="form-group">
                        <label htmlFor="name">이름</label>
                        <input
                            id="name"
                            name="name"
                            type="text"
                            placeholder="본인 이름"
                            value={form.name}
                            onChange={handleChange}
                            required
                        />
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label htmlFor="class_name">반</label>
                            <select
                                id="class_name"
                                name="class_name"
                                value={form.class_name}
                                onChange={handleChange}
                                required
                            >
                                {CLASSES.map((cls) => (
                                    <option key={cls} value={cls}>{cls}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label htmlFor="student_number">번호</label>
                            <input
                                id="student_number"
                                name="student_number"
                                type="number"
                                placeholder="번호"
                                min="1"
                                max="50"
                                value={form.student_number}
                                onChange={handleChange}
                                required
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label htmlFor="reg-email">이메일</label>
                        <input
                            id="reg-email"
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
                        <label htmlFor="reg-password">비밀번호</label>
                        <input
                            id="reg-password"
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
                        <label htmlFor="confirmPassword">비밀번호 확인</label>
                        <input
                            id="confirmPassword"
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
                        {loading ? <span className="btn-spinner" /> : '가입 완료'}
                    </button>
                </form>

                <div className="auth-footer">
                    <p>이미 계정이 있으신가요? <Link to="/login">로그인</Link></p>
                </div>
            </div>
        </div>
    )
}
