import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'

const CLASSES = Array.from({ length: 10 }, (_, i) => `${i + 1}반`)

export default function MyPage() {
    const { user, profile, refreshProfile } = useAuth()
    const [form, setForm] = useState({
        name: '',
        class_name: '1반',
        student_number: '',
    })
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')

    const isStudent = profile?.role === 'student'
    const backPath = profile?.role === 'teacher' ? '/teacher' : '/student'
    const roleLabel = profile?.role === 'teacher' ? '교사' : '학생'
    const badgeClass = profile?.role === 'teacher' ? 'teacher-badge' : 'student-badge'

    const hasChanges = useMemo(() => {
        if (!profile) return false
        const currentNumber = profile.student_number ? String(profile.student_number) : ''
        return (
            form.name.trim() !== (profile.name || '')
            || (isStudent && form.class_name !== (profile.class_name || '1반'))
            || (isStudent && form.student_number.trim() !== currentNumber)
        )
    }, [form, isStudent, profile])

    useEffect(() => {
        if (!profile) return
        setForm({
            name: profile.name || '',
            class_name: profile.class_name || '1반',
            student_number: profile.student_number ? String(profile.student_number) : '',
        })
        setError('')
    }, [profile])

    function handleChange(event) {
        const { name, value } = event.target
        setForm((current) => ({ ...current, [name]: value }))
        setError('')
        setSuccess('')
    }

    async function handleSubmit(event) {
        event.preventDefault()
        setError('')
        setSuccess('')

        const name = form.name.trim()
        if (!name) {
            setError('이름을 입력해 주세요.')
            return
        }

        const payload = { name }
        if (isStudent) {
            const studentNumber = Number(form.student_number)
            if (!Number.isInteger(studentNumber) || studentNumber < 1 || studentNumber > 50) {
                setError('번호는 1번부터 50번 사이로 입력해 주세요.')
                return
            }
            payload.class_name = form.class_name
            payload.student_number = studentNumber
        }

        setSaving(true)
        const { error: updateError } = await supabase
            .from('profiles')
            .update(payload)
            .eq('id', profile.id)

        if (updateError) {
            console.error('updateProfile error:', updateError)
            setError('정보 저장 중 오류가 발생했습니다: ' + updateError.message)
        } else {
            await refreshProfile()
            setSuccess('내 정보가 저장되었습니다.')
        }
        setSaving(false)
    }

    return (
        <div className="app-container">
            <header className="app-header">
                <div className="header-info">
                    <span className={`header-badge ${badgeClass}`}>{roleLabel}</span>
                    <div>
                        <strong>마이페이지</strong>
                        <span className="header-sub">내 계정 정보 관리</span>
                    </div>
                </div>
                <Link className="btn-secondary" to={backPath}>돌아가기</Link>
            </header>

            <main className="main-content">
                <section className="profile-section">
                    <div className="profile-card">
                        <div className="profile-card-header">
                            <h2>본인 정보</h2>
                            <p>생활기록부 작성에 사용되는 이름, 반, 번호를 수정할 수 있습니다.</p>
                        </div>

                        <form className="profile-form" onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label htmlFor="profile-email">이메일</label>
                                <div id="profile-email" className="readonly-field">{user?.email}</div>
                            </div>

                            <div className="form-group">
                                <label htmlFor="profile-role">계정 유형</label>
                                <div id="profile-role" className="readonly-field">{roleLabel}</div>
                            </div>

                            <div className="form-group">
                                <label htmlFor="profile-name">이름</label>
                                <input
                                    id="profile-name"
                                    name="name"
                                    type="text"
                                    value={form.name}
                                    onChange={handleChange}
                                    placeholder="이름"
                                    required
                                />
                            </div>

                            {isStudent && (
                                <div className="form-row">
                                    <div className="form-group">
                                        <label htmlFor="profile-class">반</label>
                                        <select
                                            id="profile-class"
                                            name="class_name"
                                            value={form.class_name}
                                            onChange={handleChange}
                                            required
                                        >
                                            {CLASSES.map((className) => (
                                                <option key={className} value={className}>{className}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label htmlFor="profile-number">번호</label>
                                        <input
                                            id="profile-number"
                                            name="student_number"
                                            type="number"
                                            min="1"
                                            max="50"
                                            value={form.student_number}
                                            onChange={handleChange}
                                            placeholder="번호"
                                            required
                                        />
                                    </div>
                                </div>
                            )}

                            {error && <div className="error-msg">{error}</div>}
                            {success && <div className="success-msg">{success}</div>}

                            <button
                                type="submit"
                                className="btn-primary"
                                disabled={saving || !hasChanges}
                            >
                                {saving ? <span className="btn-spinner" /> : '저장하기'}
                            </button>
                        </form>
                    </div>
                </section>
            </main>
        </div>
    )
}
