import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function ProtectedRoute({ children, requiredRole }) {
    const { user, profile, loading } = useAuth()

    if (loading) {
        return (
            <div className="loading-screen">
                <div className="spinner" />
                <p>로딩 중...</p>
            </div>
        )
    }

    if (!user) return <Navigate to="/login" replace />

    if (requiredRole && profile?.role !== requiredRole) {
        if (profile?.role === 'teacher') return <Navigate to="/teacher" replace />
        if (profile?.role === 'student') return <Navigate to="/student" replace />
        return <Navigate to="/login" replace />
    }

    return children
}
