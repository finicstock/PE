import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'

const CLASSES = Array.from({ length: 10 }, (_, i) => `${i + 1}반`)

export default function TeacherDashboard() {
    const { profile, signOut } = useAuth()
    const [activeClass, setActiveClass] = useState('1반')
    const [students, setStudents] = useState([])
    const [selectedStudent, setSelectedStudent] = useState(null)
    const [studentLogs, setStudentLogs] = useState([])
    const [loadingStudents, setLoadingStudents] = useState(false)
    const [loadingLogs, setLoadingLogs] = useState(false)

    useEffect(() => {
        setSelectedStudent(null)
        setStudentLogs([])
        fetchStudents(activeClass)
    }, [activeClass])

    async function fetchStudents(className) {
        setLoadingStudents(true)
        const { data } = await supabase
            .from('profiles')
            .select('*')
            .eq('class_name', className)
            .eq('role', 'student')
            .order('student_number', { ascending: true })
        setStudents(data || [])
        setLoadingStudents(false)
    }

    async function handleStudentClick(student) {
        setSelectedStudent(student)
        setLoadingLogs(true)
        const { data } = await supabase
            .from('activity_logs')
            .select('*')
            .eq('student_id', student.id)
            .order('recorded_at', { ascending: false })
        setStudentLogs(data || [])
        setLoadingLogs(false)
    }

    function formatDateTime(isoString) {
        const d = new Date(isoString)
        return d.toLocaleString('ko-KR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            weekday: 'short',
        })
    }

    return (
        <div className="app-container">
            {/* Header */}
            <header className="app-header">
                <div className="header-info">
                    <span className="header-badge teacher-badge">교사</span>
                    <div>
                        <strong>{profile?.name}</strong>
                        <span className="header-sub">관리자 대시보드</span>
                    </div>
                </div>
                <button className="btn-logout" onClick={signOut}>로그아웃</button>
            </header>

            {/* Class Tabs */}
            <div className="class-tab-wrapper">
                <div className="class-tab-scroll">
                    {CLASSES.map((cls) => (
                        <button
                            key={cls}
                            className={`class-tab-btn ${activeClass === cls ? 'active' : ''}`}
                            onClick={() => setActiveClass(cls)}
                        >
                            {cls}
                        </button>
                    ))}
                </div>
            </div>

            <main className="main-content">
                {/* Student Detail View */}
                {selectedStudent ? (
                    <div className="detail-section">
                        <button
                            className="btn-back"
                            onClick={() => { setSelectedStudent(null); setStudentLogs([]) }}
                        >
                            ← 목록으로
                        </button>

                        <div className="student-detail-header">
                            <div className="student-avatar">
                                {selectedStudent.name.charAt(0)}
                            </div>
                            <div>
                                <h2>{selectedStudent.name}</h2>
                                <p>{selectedStudent.class_name} {selectedStudent.student_number}번</p>
                            </div>
                        </div>

                        <h3 className="section-title">
                            활동 기록 <span className="badge">{studentLogs.length}건</span>
                        </h3>

                        {loadingLogs ? (
                            <div className="center-spinner"><div className="spinner" /></div>
                        ) : studentLogs.length === 0 ? (
                            <div className="empty-state">
                                <span>📭</span>
                                <p>아직 기록된 활동이 없습니다.</p>
                            </div>
                        ) : (
                            <div className="log-list">
                                {studentLogs.map((log) => (
                                    <div key={log.id} className="log-card">
                                        <div className="log-date">{formatDateTime(log.recorded_at)}</div>
                                        <div className="log-content">{log.content}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    /* Student List */
                    <div className="student-list-section">
                        <h2 className="section-title">
                            {activeClass} 학생 목록
                            {!loadingStudents && (
                                <span className="badge">{students.length}명</span>
                            )}
                        </h2>

                        {loadingStudents ? (
                            <div className="center-spinner"><div className="spinner" /></div>
                        ) : students.length === 0 ? (
                            <div className="empty-state">
                                <span>🏫</span>
                                <p>{activeClass}에 등록된 학생이 없습니다.</p>
                            </div>
                        ) : (
                            <div className="student-list">
                                {students.map((student) => (
                                    <button
                                        key={student.id}
                                        className="student-item"
                                        onClick={() => handleStudentClick(student)}
                                    >
                                        <span className="student-number">{student.student_number}번</span>
                                        <span className="student-name">{student.name}</span>
                                        <span className="student-arrow">→</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    )
}
