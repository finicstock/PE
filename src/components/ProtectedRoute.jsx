import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { isTeacherRole } from '../lib/roles'

export function ProtectedRoute({ children, requiredRole }) {
    const { user, profile, loading, signOut } = useAuth()

    if (loading) {
        return (
            <div className="loading-screen">
                <div className="spinner" />
                <p>로딩 중...</p>
            </div>
        )
    }

    if (!user) return <Navigate to="/login" replace />

    if (profile?.is_active === false) {
        return (
            <div className="auth-container">
                <div className="auth-card">
                    <div className="auth-logo">
                        <h1>비활성화된 계정</h1>
                        <p>마스터관리자가 사용을 중지한 계정입니다.</p>
                    </div>
                    <button className="btn-primary" onClick={signOut}>로그아웃</button>
                </div>
            </div>
        )
    }

    const allowedRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole]

    if (requiredRole && !allowedRoles.includes(profile?.role)) {
        if (isTeacherRole(profile?.role)) return <Navigate to="/teacher" replace />
        if (profile?.role === 'student') return <Navigate to="/student" replace />
        return <Navigate to="/login" replace />
    }

    return children
}
