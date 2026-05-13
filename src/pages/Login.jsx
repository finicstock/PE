import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Login() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const navigate = useNavigate()
    const { profile } = useAuth()

    // profile이 로드되면 role에 따라 이동
    useEffect(() => {
        if (profile) {
            if (profile.role === 'teacher') navigate('/teacher', { replace: true })
            else navigate('/student', { replace: true })
        }
    }, [profile, navigate])

    async function handleLogin(e) {
        e.preventDefault()
        setError('')
        setLoading(true)
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) {
            setError('이메일 또는 비밀번호가 올바르지 않습니다.')
        }
        // 성공/실패 상관없이 로딩 해제 (리다이렉트는 useEffect가 담당)
        setLoading(false)
    }

    return (
        <div className="auth-container">
            <div className="auth-card">
                <div className="auth-logo">
                    <span className="logo-icon">🏃</span>
                    <h1>체육 활동 기록부</h1>
                    <p>로그인하여 시작하세요</p>
                </div>

                <form onSubmit={handleLogin} className="auth-form">
                    <div className="form-group">
                        <label htmlFor="email">이메일</label>
                        <input
                            id="email"
                            type="email"
                            placeholder="이메일 입력"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            autoComplete="email"
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="password">비밀번호</label>
                        <input
                            id="password"
                            type="password"
                            placeholder="비밀번호 입력"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            autoComplete="current-password"
                        />
                    </div>

                    {error && <div className="error-msg">{error}</div>}

                    <button type="submit" className="btn-primary" disabled={loading}>
                        {loading ? <span className="btn-spinner" /> : '로그인'}
                    </button>
                </form>

                <div className="auth-footer">
                    <p>계정이 없으신가요? <Link to="/register">학생 회원가입</Link></p>
                </div>
            </div>
        </div>
    )
}
