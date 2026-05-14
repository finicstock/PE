import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import Login from './pages/Login'
import Register from './pages/Register'
import StudentHome from './pages/StudentHome'
import TeacherDashboard from './pages/TeacherDashboard'
import MyPage from './pages/MyPage'
import TeacherRegister from './pages/TeacherRegister'
import { ROLES } from './lib/roles'

export default function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <Routes>
                    <Route path="/" element={<Navigate to="/login" replace />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<Register />} />
                    <Route path="/teacher-register" element={<TeacherRegister />} />
                    <Route
                        path="/student"
                        element={
                            <ProtectedRoute requiredRole="student">
                                <StudentHome />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/teacher"
                        element={
                            <ProtectedRoute requiredRole={[ROLES.MASTER_TEACHER, ROLES.SUB_TEACHER]}>
                                <TeacherDashboard />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/mypage"
                        element={
                            <ProtectedRoute>
                                <MyPage />
                            </ProtectedRoute>
                        }
                    />
                    <Route path="*" element={<Navigate to="/login" replace />} />
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    )
}
