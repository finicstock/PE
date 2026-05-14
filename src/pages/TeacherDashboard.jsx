import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { getLogContent, getLogTags } from '../lib/activityTags'
import { getRoleLabel, isMasterAdmin, ROLES } from '../lib/roles'

const CLASSES = Array.from({ length: 10 }, (_, i) => `${i + 1}반`)

export default function TeacherDashboard() {
    const { profile, signOut } = useAuth()
    const masterAdmin = isMasterAdmin(profile)
    const [view, setView] = useState('students')
    const [activeClass, setActiveClass] = useState('1반')
    const [students, setStudents] = useState([])
    const [selectedStudent, setSelectedStudent] = useState(null)
    const [studentLogs, setStudentLogs] = useState([])
    const [loadingStudents, setLoadingStudents] = useState(false)
    const [loadingLogs, setLoadingLogs] = useState(false)
    const [exportingClass, setExportingClass] = useState(false)
    const [exportMessage, setExportMessage] = useState('')
    const [exportError, setExportError] = useState('')
    const [studentInviteCode, setStudentInviteCode] = useState('')
    const [creatingStudentInvite, setCreatingStudentInvite] = useState(false)
    const [subAdmins, setSubAdmins] = useState([])
    const [subAdminInvites, setSubAdminInvites] = useState([])
    const [loadingSubAdmins, setLoadingSubAdmins] = useState(false)
    const [creatingSubAdminInvite, setCreatingSubAdminInvite] = useState(false)
    const [adminMessage, setAdminMessage] = useState('')
    const [adminError, setAdminError] = useState('')

    useEffect(() => {
        setSelectedStudent(null)
        setStudentLogs([])
        setExportMessage('')
        setExportError('')
        if (view === 'students') fetchStudents(activeClass)
    }, [activeClass, view, profile?.id])

    useEffect(() => {
        if (view === 'subadmins' && masterAdmin) fetchSubAdminData()
    }, [view, masterAdmin])

    async function fetchStudents(className) {
        if (!profile?.id) return

        setLoadingStudents(true)
        let query = supabase
            .from('profiles')
            .select('*')
            .eq('class_name', className)
            .eq('role', ROLES.STUDENT)
            .order('student_number', { ascending: true })

        if (profile.role === ROLES.SUB_TEACHER) {
            query = query.eq('manager_id', profile.id)
        }

        const { data, error } = await query

        if (error) {
            console.error('fetchStudents error:', error)
            setStudents([])
        } else {
            setStudents(data || [])
        }

        setLoadingStudents(false)
    }

    async function fetchSubAdminData() {
        if (!profile?.id) return

        setLoadingSubAdmins(true)
        setAdminError('')

        const [profilesResult, invitesResult] = await Promise.all([
            supabase
                .from('profiles')
                .select('id, name, role, manager_id, is_active, created_at')
                .eq('role', ROLES.SUB_TEACHER)
                .eq('manager_id', profile.id)
                .order('created_at', { ascending: false }),
            supabase
                .from('invite_codes')
                .select('*')
                .eq('invite_type', ROLES.SUB_TEACHER)
                .eq('owner_id', profile.id)
                .order('created_at', { ascending: false })
                .limit(20),
        ])

        if (profilesResult.error) {
            console.error('fetchSubAdmins error:', profilesResult.error)
            setAdminError('서브관리자 목록을 불러오지 못했습니다.')
            setSubAdmins([])
        } else {
            setSubAdmins(profilesResult.data || [])
        }

        if (invitesResult.error) {
            console.error('fetchSubAdminInvites error:', invitesResult.error)
            setSubAdminInvites([])
        } else {
            setSubAdminInvites(invitesResult.data || [])
        }

        setLoadingSubAdmins(false)
    }

    async function handleStudentClick(student) {
        setSelectedStudent(student)
        setLoadingLogs(true)
        const { data, error } = await supabase
            .from('activity_logs')
            .select('*')
            .eq('student_id', student.id)
            .order('recorded_at', { ascending: false })

        if (error) {
            console.error('fetchStudentLogs error:', error)
            setStudentLogs([])
        } else {
            setStudentLogs(data || [])
        }

        setLoadingLogs(false)
    }

    async function createInvite(inviteType) {
        const isStudentInvite = inviteType === ROLES.STUDENT
        if (isStudentInvite) setCreatingStudentInvite(true)
        else setCreatingSubAdminInvite(true)

        setAdminMessage('')
        setAdminError('')
        setExportMessage('')
        setExportError('')

        const { data, error } = await supabase.rpc('create_invite_code', {
            p_invite_type: inviteType,
        })

        if (error) {
            console.error('createInvite error:', error)
            const message = inviteType === ROLES.SUB_TEACHER
                ? '서브관리자 초대코드를 만들지 못했습니다.'
                : '학생 등록코드를 만들지 못했습니다.'
            if (isStudentInvite) setExportError(message)
            else setAdminError(message)
        } else if (isStudentInvite) {
            setStudentInviteCode(data)
            setExportMessage('학생 등록코드를 만들었습니다.')
        } else {
            setAdminMessage(`서브관리자 초대코드가 생성되었습니다: ${data}`)
            await fetchSubAdminData()
        }

        if (isStudentInvite) setCreatingStudentInvite(false)
        else setCreatingSubAdminInvite(false)
    }

    async function toggleSubAdmin(subAdmin) {
        setAdminError('')
        setAdminMessage('')

        const { error } = await supabase
            .from('profiles')
            .update({ is_active: !subAdmin.is_active })
            .eq('id', subAdmin.id)
            .eq('role', ROLES.SUB_TEACHER)

        if (error) {
            console.error('toggleSubAdmin error:', error)
            setAdminError('서브관리자 상태를 변경하지 못했습니다.')
        } else {
            setAdminMessage(`${subAdmin.name} 계정을 ${subAdmin.is_active ? '비활성화' : '활성화'}했습니다.`)
            await fetchSubAdminData()
        }
    }

    async function handleClassExport() {
        if (students.length === 0) return

        setExportingClass(true)
        setExportMessage('')
        setExportError('')

        try {
            const studentIds = students.map((student) => student.id)
            const { data, error } = await supabase
                .from('activity_logs')
                .select('*')
                .in('student_id', studentIds)
                .order('recorded_at', { ascending: true })

            if (error) throw error

            const logsByStudent = new Map()
            for (const log of data || []) {
                const existing = logsByStudent.get(log.student_id) || []
                existing.push(log)
                logsByStudent.set(log.student_id, existing)
            }

            const rows = students.map((student) => {
                const logs = logsByStudent.get(student.id) || []
                const latestLog = logs[logs.length - 1]
                const tagSummary = getUniqueTags(logs).join(', ')
                const combinedLogs = logs
                    .map((log, index) => {
                        const tags = getLogTags(log)
                        const tagText = tags.length ? ` (${tags.join(', ')})` : ''
                        return `${index + 1}. [${formatDateTime(log.recorded_at)}]${tagText}\n${getLogContent(log)}`
                    })
                    .join('\n\n')

                return [
                    student.class_name,
                    student.student_number,
                    student.name,
                    logs.length,
                    latestLog ? formatDateTime(latestLog.recorded_at) : '',
                    tagSummary,
                    combinedLogs,
                ]
            })

            const headers = [
                '반',
                '번호',
                '이름',
                '기록 수',
                '최근 기록일',
                '태그',
                '생활기록부 참고 활동 기록',
            ]
            const csv = toCsv([headers, ...rows])
            const filename = `${safeFilename(activeClass)}_생활기록부_활동기록_${getDateStamp()}.csv`
            downloadCsv(csv, filename)
            setExportMessage(`${activeClass} 자료 다운로드 완료`)
        } catch (error) {
            console.error('exportClassLogs error:', error)
            setExportError('엑셀 데이터를 만들지 못했습니다.')
        } finally {
            setExportingClass(false)
        }
    }

    function getUniqueTags(logs) {
        return [...new Set(logs.flatMap((log) => getLogTags(log)))]
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

    function getDateStamp() {
        const d = new Date()
        const year = d.getFullYear()
        const month = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        return `${year}${month}${day}`
    }

    function safeFilename(value) {
        return String(value).replace(/[\\/:*?"<>|]/g, '')
    }

    function escapeCsvCell(value) {
        const text = String(value ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
        return `"${text.replace(/"/g, '""')}"`
    }

    function toCsv(rows) {
        return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')
    }

    function downloadCsv(csv, filename) {
        const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = filename
        document.body.appendChild(link)
        link.click()
        link.remove()
        URL.revokeObjectURL(url)
    }

    return (
        <div className="app-container">
            <header className="app-header">
                <div className="header-info">
                    <span className="header-badge teacher-badge">{getRoleLabel(profile?.role)}</span>
                    <div>
                        <strong>{profile?.name}</strong>
                        <span className="header-sub">
                            {masterAdmin ? '전체 관리자 대시보드' : '내 학생 관리 대시보드'}
                        </span>
                    </div>
                </div>
                <div className="header-actions">
                    <Link className="btn-secondary" to="/mypage">마이페이지</Link>
                    <button className="btn-logout" onClick={signOut}>로그아웃</button>
                </div>
            </header>

            {masterAdmin && (
                <div className="admin-view-tabs">
                    <button
                        type="button"
                        className={`admin-view-tab ${view === 'students' ? 'active' : ''}`}
                        onClick={() => setView('students')}
                    >
                        학생 관리
                    </button>
                    <button
                        type="button"
                        className={`admin-view-tab ${view === 'subadmins' ? 'active' : ''}`}
                        onClick={() => setView('subadmins')}
                    >
                        서브관리자
                    </button>
                </div>
            )}

            {view === 'students' && (
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
            )}

            <main className="main-content">
                {view === 'subadmins' && masterAdmin ? (
                    <SubAdminPanel
                        subAdmins={subAdmins}
                        invites={subAdminInvites}
                        loading={loadingSubAdmins}
                        creatingInvite={creatingSubAdminInvite}
                        message={adminMessage}
                        error={adminError}
                        onCreateInvite={() => createInvite(ROLES.SUB_TEACHER)}
                        onToggleSubAdmin={toggleSubAdmin}
                    />
                ) : selectedStudent ? (
                    <StudentDetail
                        student={selectedStudent}
                        logs={studentLogs}
                        loading={loadingLogs}
                        onBack={() => { setSelectedStudent(null); setStudentLogs([]) }}
                        formatDateTime={formatDateTime}
                    />
                ) : (
                    <div className="student-list-section">
                        <div className="section-toolbar">
                            <h2 className="section-title">
                                {activeClass} 학생 목록
                                {!loadingStudents && (
                                    <span className="badge">{students.length}명</span>
                                )}
                            </h2>
                            <div className="toolbar-actions">
                                <button
                                    type="button"
                                    className="btn-export"
                                    onClick={() => createInvite(ROLES.STUDENT)}
                                    disabled={creatingStudentInvite}
                                >
                                    {creatingStudentInvite ? <span className="btn-spinner" /> : '학생 코드 생성'}
                                </button>
                                <button
                                    type="button"
                                    className="btn-export"
                                    onClick={handleClassExport}
                                    disabled={loadingStudents || exportingClass || students.length === 0}
                                >
                                    {exportingClass ? <span className="btn-spinner" /> : '엑셀 다운로드'}
                                </button>
                            </div>
                        </div>

                        {studentInviteCode && (
                            <InviteCodeBox
                                title="학생 등록코드"
                                code={studentInviteCode}
                                path="/register"
                            />
                        )}
                        {exportMessage && <div className="success-msg export-status">{exportMessage}</div>}
                        {exportError && <div className="error-msg export-status">{exportError}</div>}

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
                                        {masterAdmin && student.manager_id && (
                                            <span className="student-owner">담당 지정</span>
                                        )}
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

function StudentDetail({ student, logs, loading, onBack, formatDateTime }) {
    return (
        <div className="detail-section">
            <button className="btn-back" onClick={onBack}>← 목록으로</button>

            <div className="student-detail-header">
                <div className="student-avatar">{student.name.charAt(0)}</div>
                <div>
                    <h2>{student.name}</h2>
                    <p>{student.class_name} {student.student_number}번</p>
                </div>
            </div>

            <h3 className="section-title">
                활동 기록 <span className="badge">{logs.length}건</span>
            </h3>

            {loading ? (
                <div className="center-spinner"><div className="spinner" /></div>
            ) : logs.length === 0 ? (
                <div className="empty-state">
                    <span>📭</span>
                    <p>아직 기록된 활동이 없습니다.</p>
                </div>
            ) : (
                <div className="log-list">
                    {logs.map((log) => {
                        const tags = getLogTags(log)
                        return (
                            <div key={log.id} className="log-card">
                                <div className="log-date">{formatDateTime(log.recorded_at)}</div>
                                {tags.length > 0 && <TagList tags={tags} />}
                                <div className="log-content">{getLogContent(log)}</div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

function SubAdminPanel({
    subAdmins,
    invites,
    loading,
    creatingInvite,
    message,
    error,
    onCreateInvite,
    onToggleSubAdmin,
}) {
    return (
        <div className="management-panel">
            <div className="panel-card">
                <div className="section-toolbar">
                    <div>
                        <h2 className="section-title">서브관리자 관리</h2>
                        <p>초대코드를 발급하고 서브관리자 계정을 활성화 또는 비활성화할 수 있습니다.</p>
                    </div>
                    <button
                        type="button"
                        className="btn-export"
                        onClick={onCreateInvite}
                        disabled={creatingInvite}
                    >
                        {creatingInvite ? <span className="btn-spinner" /> : '초대코드 생성'}
                    </button>
                </div>

                {message && <div className="success-msg export-status">{message}</div>}
                {error && <div className="error-msg export-status">{error}</div>}

                <div className="invite-list">
                    <h3>최근 초대코드</h3>
                    {invites.length === 0 ? (
                        <p>아직 발급된 초대코드가 없습니다.</p>
                    ) : (
                        invites.map((invite) => (
                            <InviteCodeBox
                                key={invite.id}
                                title={invite.used_at ? '사용 완료' : '사용 가능'}
                                code={invite.code}
                                path="/teacher-register"
                                muted={Boolean(invite.used_at || invite.revoked_at)}
                            />
                        ))
                    )}
                </div>
            </div>

            <div className="panel-card">
                <h2 className="section-title">등록된 서브관리자</h2>
                {loading ? (
                    <div className="center-spinner"><div className="spinner" /></div>
                ) : subAdmins.length === 0 ? (
                    <div className="empty-state compact">
                        <span>👥</span>
                        <p>등록된 서브관리자가 없습니다.</p>
                    </div>
                ) : (
                    <div className="admin-list">
                        {subAdmins.map((admin) => (
                            <div key={admin.id} className="admin-item">
                                <div>
                                    <strong>{admin.name}</strong>
                                    <span>{admin.is_active ? '활성 계정' : '비활성 계정'}</span>
                                </div>
                                <button
                                    type="button"
                                    className={admin.is_active ? 'btn-danger-soft' : 'btn-export'}
                                    onClick={() => onToggleSubAdmin(admin)}
                                >
                                    {admin.is_active ? '비활성화' : '활성화'}
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

function InviteCodeBox({ title, code, path, muted = false }) {
    const url = `${window.location.origin}${path}?code=${encodeURIComponent(code)}`

    return (
        <div className={`invite-code-box ${muted ? 'muted' : ''}`}>
            <span>{title}</span>
            <strong>{code}</strong>
            <p>{url}</p>
        </div>
    )
}

function TagList({ tags }) {
    return (
        <div className="tag-list">
            {tags.map((tag) => (
                <span key={tag} className="tag-chip">{tag}</span>
            ))}
        </div>
    )
}
