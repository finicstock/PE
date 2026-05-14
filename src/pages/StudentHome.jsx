import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import {
    ACTIVITY_TAGS,
    buildTaggedContent,
    getLogContent,
    getLogTags,
    shouldRetryWithoutTags,
} from '../lib/activityTags'

const EMPTY_TEMPLATE = {
    activity: '',
    difficulty: '',
    improvement: '',
    goal: '',
}

const TEMPLATE_FIELDS = [
    {
        key: 'activity',
        label: '오늘 한 활동',
        placeholder: '예) 농구 자유투와 레이업 슛 연습을 했다.',
    },
    {
        key: 'difficulty',
        label: '어려웠던 점',
        placeholder: '예) 슛 자세가 흔들려 성공률이 낮았다.',
    },
    {
        key: 'improvement',
        label: '개선한 점',
        placeholder: '예) 팔꿈치 위치를 고정하니 공의 방향이 안정되었다.',
    },
    {
        key: 'goal',
        label: '다음 목표',
        placeholder: '예) 다음 시간에는 연속 5회 성공을 목표로 하겠다.',
    },
]

export default function StudentHome() {
    const { profile, signOut } = useAuth()
    const [tab, setTab] = useState('write')
    const [writeMode, setWriteMode] = useState('free')
    const [content, setContent] = useState('')
    const [templateFields, setTemplateFields] = useState(EMPTY_TEMPLATE)
    const [selectedTags, setSelectedTags] = useState([])
    const [logs, setLogs] = useState([])
    const [submitting, setSubmitting] = useState(false)
    const [submitSuccess, setSubmitSuccess] = useState(false)
    const [loadingLogs, setLoadingLogs] = useState(false)
    const [error, setError] = useState('')
    const [draftLoaded, setDraftLoaded] = useState(false)
    const [draftStatus, setDraftStatus] = useState('')

    const draftKey = profile?.id ? `smalltalk-activity-draft:${profile.id}` : null
    const activeContent = getActiveContent()

    useEffect(() => {
        if (tab === 'history') fetchLogs()
    }, [tab])

    useEffect(() => {
        if (!draftKey) return

        setDraftLoaded(false)
        setDraftStatus('')

        try {
            const savedDraft = localStorage.getItem(draftKey)
            if (savedDraft) {
                const parsed = JSON.parse(savedDraft)
                setWriteMode(parsed.writeMode === 'template' ? 'template' : 'free')
                setContent(typeof parsed.content === 'string' ? parsed.content : '')
                setTemplateFields({ ...EMPTY_TEMPLATE, ...(parsed.templateFields || {}) })
                setSelectedTags(Array.isArray(parsed.selectedTags) ? parsed.selectedTags : [])
                setDraftStatus('임시 저장됨')
            } else {
                setWriteMode('free')
                setContent('')
                setTemplateFields(EMPTY_TEMPLATE)
                setSelectedTags([])
            }
        } catch (error) {
            console.error('loadDraft error:', error)
        } finally {
            setDraftLoaded(true)
        }
    }, [draftKey])

    useEffect(() => {
        if (!draftLoaded || !draftKey) return

        const hasDraft = Boolean(
            content.trim()
            || selectedTags.length
            || Object.values(templateFields).some((value) => value.trim())
        )

        if (hasDraft) setDraftStatus('저장 중...')

        const timeoutId = setTimeout(() => {
            try {
                if (hasDraft) {
                    localStorage.setItem(draftKey, JSON.stringify({
                        writeMode,
                        content,
                        templateFields,
                        selectedTags,
                        updatedAt: Date.now(),
                    }))
                    setDraftStatus('임시 저장됨')
                } else {
                    localStorage.removeItem(draftKey)
                    setDraftStatus('')
                }
            } catch (error) {
                console.error('saveDraft error:', error)
                setDraftStatus('임시 저장 실패')
            }
        }, 450)

        return () => clearTimeout(timeoutId)
    }, [content, draftKey, draftLoaded, selectedTags, templateFields, writeMode])

    async function fetchLogs() {
        setLoadingLogs(true)
        const { data, error } = await supabase
            .from('activity_logs')
            .select('*')
            .eq('student_id', profile.id)
            .order('recorded_at', { ascending: false })

        if (error) {
            console.error('fetchLogs error:', error)
            setLogs([])
        } else {
            setLogs(data || [])
        }

        setLoadingLogs(false)
    }

    function toggleTag(tag) {
        setSelectedTags((current) => {
            if (current.includes(tag)) {
                return current.filter((item) => item !== tag)
            }
            return [...current, tag]
        })
    }

    function updateTemplateField(key, value) {
        setTemplateFields((current) => ({
            ...current,
            [key]: value,
        }))
    }

    function getTemplateContent() {
        return TEMPLATE_FIELDS
            .map(({ key, label }) => {
                const value = templateFields[key].trim()
                return value ? `${label}: ${value}` : ''
            })
            .filter(Boolean)
            .join('\n')
    }

    function getActiveContent() {
        if (writeMode === 'template') return getTemplateContent()
        return content.trim()
    }

    function clearDraft() {
        setContent('')
        setTemplateFields(EMPTY_TEMPLATE)
        setSelectedTags([])
        setDraftStatus('')
        if (draftKey) localStorage.removeItem(draftKey)
    }

    async function handleSubmit(e) {
        e.preventDefault()
        const trimmedContent = getActiveContent()
        if (!trimmedContent) return

        setError('')
        setSubmitting(true)
        setSubmitSuccess(false)

        const basePayload = {
            student_id: profile.id,
            content: trimmedContent,
            recorded_at: new Date().toISOString(),
        }

        const initialPayload = selectedTags.length > 0
            ? { ...basePayload, tags: selectedTags }
            : basePayload

        let { error } = await supabase.from('activity_logs').insert(initialPayload)

        if (shouldRetryWithoutTags(error)) {
            const fallbackContent = buildTaggedContent(trimmedContent, selectedTags)
            const retry = await supabase.from('activity_logs').insert({
                ...basePayload,
                content: fallbackContent,
            })
            error = retry.error
        }

        if (error) {
            setError('제출 중 오류가 발생했습니다: ' + error.message)
        } else {
            setSubmitSuccess(true)
            clearDraft()
            setTimeout(() => setSubmitSuccess(false), 3000)
        }

        setSubmitting(false)
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
            <header className="app-header">
                <div className="header-info">
                    <span className="header-badge student-badge">학생</span>
                    <div>
                        <strong>{profile?.name}</strong>
                        <span className="header-sub">{profile?.class_name} {profile?.student_number}번</span>
                    </div>
                </div>
                <button className="btn-logout" onClick={signOut}>로그아웃</button>
            </header>

            <div className="tab-bar">
                <button
                    className={`tab-btn ${tab === 'write' ? 'active' : ''}`}
                    onClick={() => setTab('write')}
                >
                    활동 기록하기
                </button>
                <button
                    className={`tab-btn ${tab === 'history' ? 'active' : ''}`}
                    onClick={() => setTab('history')}
                >
                    내 기록 보기
                </button>
            </div>

            <main className="main-content">
                {tab === 'write' && (
                    <div className="write-section">
                        <div className="realtime-clock">
                            <RealtimeClock />
                        </div>
                        <p className="write-hint">현재 시각이 자동으로 기록됩니다.</p>

                        <form onSubmit={handleSubmit} className="write-form">
                            <div className="write-mode-toggle" role="tablist" aria-label="기록 작성 방식">
                                <button
                                    type="button"
                                    className={`write-mode-btn ${writeMode === 'free' ? 'active' : ''}`}
                                    aria-selected={writeMode === 'free'}
                                    onClick={() => setWriteMode('free')}
                                >
                                    자유 기록
                                </button>
                                <button
                                    type="button"
                                    className={`write-mode-btn ${writeMode === 'template' ? 'active' : ''}`}
                                    aria-selected={writeMode === 'template'}
                                    onClick={() => setWriteMode('template')}
                                >
                                    템플릿 작성
                                </button>
                            </div>

                            {writeMode === 'free' ? (
                                <div className="form-group">
                                    <label htmlFor="activity-content">오늘의 체육 활동 내용</label>
                                    <textarea
                                        id="activity-content"
                                        rows={6}
                                        placeholder="예) 오늘은 농구 자유투 연습을 50회 실시했다. 처음보다 성공률이 높아졌다..."
                                        value={content}
                                        onChange={(e) => setContent(e.target.value)}
                                        required
                                    />
                                    <span className="char-count">{content.length}자</span>
                                </div>
                            ) : (
                                <div className="template-fields">
                                    {TEMPLATE_FIELDS.map(({ key, label, placeholder }) => (
                                        <div key={key} className="template-field">
                                            <label htmlFor={`template-${key}`}>{label}</label>
                                            <textarea
                                                id={`template-${key}`}
                                                rows={2}
                                                placeholder={placeholder}
                                                value={templateFields[key]}
                                                onChange={(e) => updateTemplateField(key, e.target.value)}
                                            />
                                        </div>
                                    ))}
                                    <span className="char-count">{activeContent.length}자</span>
                                </div>
                            )}

                            <div className="form-group">
                                <label>활동 태그</label>
                                <div className="tag-selector" role="group" aria-label="활동 태그 선택">
                                    {ACTIVITY_TAGS.map((tag) => (
                                        <button
                                            key={tag}
                                            type="button"
                                            className={`tag-option ${selectedTags.includes(tag) ? 'active' : ''}`}
                                            aria-pressed={selectedTags.includes(tag)}
                                            onClick={() => toggleTag(tag)}
                                        >
                                            {tag}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {draftStatus && (
                                <div className="draft-status" aria-live="polite">{draftStatus}</div>
                            )}
                            {error && <div className="error-msg">{error}</div>}
                            {submitSuccess && (
                                <div className="success-msg">활동이 성공적으로 기록되었습니다!</div>
                            )}

                            <button
                                type="submit"
                                className="btn-primary"
                                disabled={submitting || !activeContent}
                            >
                                {submitting ? <span className="btn-spinner" /> : '제출하기'}
                            </button>
                        </form>
                    </div>
                )}

                {tab === 'history' && (
                    <div className="history-section">
                        <h2 className="section-title">내 활동 기록</h2>
                        {loadingLogs ? (
                            <div className="center-spinner"><div className="spinner" /></div>
                        ) : logs.length === 0 ? (
                            <div className="empty-state">
                                <span>🗒️</span>
                                <p>아직 기록이 없습니다.<br />첫 번째 활동을 기록해 보세요!</p>
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
                )}
            </main>
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

function RealtimeClock() {
    const [now, setNow] = useState(new Date())
    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 1000)
        return () => clearInterval(t)
    }, [])

    const date = now.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
    })
    const time = now.toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    })

    return (
        <div className="clock-display">
            <div className="clock-date">{date}</div>
            <div className="clock-time">{time}</div>
        </div>
    )
}
