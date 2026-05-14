const APPS_SCRIPT_URL = process.env.GOOGLE_APPS_SCRIPT_URL
const APPS_SCRIPT_SECRET = process.env.GOOGLE_APPS_SCRIPT_SECRET || ''

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return sendJson(res, 405, { error: 'POST 요청만 지원합니다.' })
    }

    try {
        const body = await readJsonBody(req)
        const className = normalizeClassName(body.className)
        const accessToken = getBearerToken(req)

        if (!className) return sendJson(res, 400, { error: '반 정보가 올바르지 않습니다.' })
        if (!accessToken) return sendJson(res, 401, { error: '로그인이 필요합니다.' })
        if (!APPS_SCRIPT_URL) {
            return sendJson(res, 500, { error: 'GOOGLE_APPS_SCRIPT_URL 환경변수가 필요합니다.' })
        }

        const supabase = getSupabaseConfig()
        const user = await fetchSupabaseUser(supabase, accessToken)
        const profile = await fetchCurrentProfile(supabase, accessToken, user.id)

        if (!profile || !['teacher', 'sub_teacher'].includes(profile.role) || profile.is_active === false) {
            return sendJson(res, 403, { error: '관리자 권한이 필요합니다.' })
        }

        const students = await fetchClassStudents(supabase, accessToken, profile, className)
        const logs = await fetchActivityLogs(supabase, accessToken, students.map((student) => student.id))
        const rows = buildRows(students, logs)

        const sheetResult = await sendRowsToAppsScript({
            className,
            rows,
            actor: {
                id: profile.id,
                name: profile.name,
                role: profile.role,
            },
        })

        return sendJson(res, 200, {
            spreadsheetId: sheetResult.spreadsheetId,
            url: sheetResult.url,
            className,
            rows: rows.length,
            created: Boolean(sheetResult.created),
            reused: !sheetResult.created,
        })
    } catch (error) {
        console.error('class-sheet error:', error)
        return sendJson(res, error.status || 500, {
            error: error.publicMessage || '구글시트 사본을 만들거나 채우는 중 오류가 발생했습니다.',
        })
    }
}

function getSupabaseConfig() {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
    if (!url || !anonKey) {
        throw publicError(500, 'Supabase 환경변수가 설정되지 않았습니다.')
    }
    return { url: url.replace(/\/$/, ''), anonKey }
}

async function fetchSupabaseUser(supabase, accessToken) {
    const response = await fetch(`${supabase.url}/auth/v1/user`, {
        headers: supabaseHeaders(supabase, accessToken),
    })
    const data = await parseJsonResponse(response)
    if (!response.ok || !data?.id) {
        throw publicError(401, '로그인 정보를 확인하지 못했습니다.')
    }
    return data
}

async function fetchCurrentProfile(supabase, accessToken, userId) {
    const params = new URLSearchParams({
        select: '*',
        id: `eq.${userId}`,
    })
    const data = await fetchSupabaseRows(supabase, accessToken, `profiles?${params.toString()}`)
    return data[0] || null
}

async function fetchClassStudents(supabase, accessToken, profile, className) {
    const params = new URLSearchParams({
        select: 'id,name,class_name,student_number,manager_id',
        role: 'eq.student',
        class_name: `eq.${className}`,
        order: 'student_number.asc',
    })

    if (profile.role === 'sub_teacher') {
        params.set('manager_id', `eq.${profile.id}`)
    }

    return fetchSupabaseRows(supabase, accessToken, `profiles?${params.toString()}`)
}

async function fetchActivityLogs(supabase, accessToken, studentIds) {
    if (studentIds.length === 0) return []

    const params = new URLSearchParams({
        select: '*',
        student_id: `in.(${studentIds.join(',')})`,
        order: 'recorded_at.asc',
    })

    return fetchSupabaseRows(supabase, accessToken, `activity_logs?${params.toString()}`)
}

async function fetchSupabaseRows(supabase, accessToken, path) {
    const response = await fetch(`${supabase.url}/rest/v1/${path}`, {
        headers: supabaseHeaders(supabase, accessToken),
    })
    const data = await parseJsonResponse(response)
    if (!response.ok) {
        throw publicError(response.status, data?.message || 'Supabase 데이터를 불러오지 못했습니다.')
    }
    return Array.isArray(data) ? data : []
}

function supabaseHeaders(supabase, accessToken) {
    return {
        apikey: supabase.anonKey,
        Authorization: `Bearer ${accessToken}`,
    }
}

function buildRows(students, logs) {
    const logsByStudent = new Map()
    for (const log of logs) {
        const existing = logsByStudent.get(log.student_id) || []
        existing.push(log)
        logsByStudent.set(log.student_id, existing)
    }

    return students.map((student) => {
        const studentLogs = logsByStudent.get(student.id) || []
        const latestLog = studentLogs[studentLogs.length - 1]
        const combinedLogs = studentLogs
            .map((log, index) => {
                const tags = getLogTags(log)
                const tagText = tags.length ? ` (${tags.join(', ')})` : ''
                return `${index + 1}. [${formatDateTime(log.recorded_at)}]${tagText}\n${getLogContent(log)}`
            })
            .join('\n\n')

        return [
            student.class_name || '',
            student.student_number || '',
            student.name || '',
            latestLog ? formatDateTime(latestLog.recorded_at) : '',
            combinedLogs,
        ]
    })
}

function getLogTags(log) {
    if (Array.isArray(log.tags)) return log.tags.filter(Boolean)
    const match = String(log.content || '').match(/^\[태그:\s*([^\]]+)\]\s*/)
    if (!match) return []
    return match[1].split(',').map((tag) => tag.trim()).filter(Boolean)
}

function getLogContent(log) {
    return String(log.content || '').replace(/^\[태그:\s*[^\]]+\]\s*/, '')
}

async function sendRowsToAppsScript(payload) {
    const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
            ...payload,
            secret: APPS_SCRIPT_SECRET,
        }),
    })
    const data = await parseJsonResponse(response)

    if (!response.ok || data?.ok === false) {
        throw publicError(
            response.status || 500,
            data?.error || 'Apps Script가 구글시트 반영에 실패했습니다.'
        )
    }

    if (!data?.url || !data?.spreadsheetId) {
        throw publicError(500, 'Apps Script 응답에 구글시트 링크가 없습니다.')
    }

    return data
}

function normalizeClassName(value) {
    const className = String(value || '').trim()
    return /^\d{1,2}반$/.test(className) ? className : ''
}

function getBearerToken(req) {
    const authorization = req.headers.authorization || req.headers.Authorization || ''
    const match = String(authorization).match(/^Bearer\s+(.+)$/i)
    return match?.[1] || ''
}

async function readJsonBody(req) {
    if (req.body) {
        return typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    }

    let raw = ''
    for await (const chunk of req) raw += chunk
    return raw ? JSON.parse(raw) : {}
}

async function parseJsonResponse(response) {
    const text = await response.text()
    if (!text) return null
    try {
        return JSON.parse(text)
    } catch {
        return { message: text }
    }
}

function formatDateTime(isoString) {
    if (!isoString) return ''
    return new Date(isoString).toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    })
}

function publicError(status, publicMessage) {
    const error = new Error(publicMessage)
    error.status = status
    error.publicMessage = publicMessage
    return error
}

function sendJson(res, status, payload) {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(payload))
}
