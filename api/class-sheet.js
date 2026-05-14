import crypto from 'node:crypto'

const TEMPLATE_ID = process.env.GOOGLE_SHEET_TEMPLATE_ID || '19sQKTDoEi9I4ZEjvYrR6m0DfwAdiEsQLC5MY9yuCbwE'
const COPY_PREFIX = process.env.GOOGLE_SHEET_COPY_PREFIX || 'SmallTalK 생활기록부'
const START_ROW = Math.max(Number(process.env.GOOGLE_SHEET_START_ROW || 2), 1)
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3'
const SHEETS_API_URL = 'https://sheets.googleapis.com/v4/spreadsheets'
const GOOGLE_SCOPES = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/spreadsheets',
].join(' ')

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

        ensureServerConfig()

        const supabase = getSupabaseConfig()
        const user = await fetchSupabaseUser(supabase, accessToken)
        const profile = await fetchCurrentProfile(supabase, accessToken, user.id)

        if (!profile || !['teacher', 'sub_teacher'].includes(profile.role) || profile.is_active === false) {
            return sendJson(res, 403, { error: '관리자 권한이 필요합니다.' })
        }

        const students = await fetchClassStudents(supabase, accessToken, profile, className)
        const logs = await fetchActivityLogs(supabase, accessToken, students.map((student) => student.id))
        const rows = buildRows(students, logs)

        const googleToken = await getGoogleAccessToken()
        const { file, created } = await getOrCreateClassSpreadsheet(googleToken, className)
        const sheetTitle = await getFirstSheetTitle(googleToken, file.id)
        await overwriteSheetRows(googleToken, file.id, sheetTitle, rows)
        await shareSpreadsheetIfConfigured(googleToken, file.id)

        return sendJson(res, 200, {
            spreadsheetId: file.id,
            url: file.webViewLink || `https://docs.google.com/spreadsheets/d/${file.id}/edit`,
            className,
            rows: rows.length,
            created,
            reused: !created,
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

function ensureServerConfig() {
    const missing = []
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) missing.push('GOOGLE_SERVICE_ACCOUNT_EMAIL')
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) missing.push('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY')
    if (!TEMPLATE_ID) missing.push('GOOGLE_SHEET_TEMPLATE_ID')

    if (missing.length > 0) {
        throw publicError(500, `Google API 환경변수가 필요합니다: ${missing.join(', ')}`)
    }
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

async function getGoogleAccessToken() {
    const now = Math.floor(Date.now() / 1000)
    const assertion = signJwt({
        iss: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        scope: GOOGLE_SCOPES,
        aud: GOOGLE_TOKEN_URL,
        iat: now,
        exp: now + 3600,
    })

    const response = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion,
        }),
    })
    const data = await parseJsonResponse(response)
    if (!response.ok || !data.access_token) {
        throw publicError(500, 'Google 인증에 실패했습니다.')
    }
    return data.access_token
}

async function getOrCreateClassSpreadsheet(accessToken, className) {
    const fileName = `${COPY_PREFIX} - ${className}`
    const existing = await findSpreadsheetByName(accessToken, fileName)
    if (existing) return { file: existing, created: false }

    const body = { name: fileName }
    if (process.env.GOOGLE_SHEET_FOLDER_ID) {
        body.parents = [process.env.GOOGLE_SHEET_FOLDER_ID]
    }

    const response = await googleFetch(
        `${DRIVE_API_URL}/files/${TEMPLATE_ID}/copy?supportsAllDrives=true&fields=id,name,webViewLink`,
        accessToken,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }
    )
    const file = await response.json()
    return { file, created: true }
}

async function findSpreadsheetByName(accessToken, fileName) {
    const conditions = [
        `name = '${escapeDriveQueryValue(fileName)}'`,
        `mimeType = 'application/vnd.google-apps.spreadsheet'`,
        'trashed = false',
    ]

    if (process.env.GOOGLE_SHEET_FOLDER_ID) {
        conditions.push(`'${escapeDriveQueryValue(process.env.GOOGLE_SHEET_FOLDER_ID)}' in parents`)
    }

    const params = new URLSearchParams({
        q: conditions.join(' and '),
        spaces: 'drive',
        fields: 'files(id,name,webViewLink)',
        pageSize: '1',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
    })

    const response = await googleFetch(`${DRIVE_API_URL}/files?${params.toString()}`, accessToken)
    const data = await response.json()
    return data.files?.[0] || null
}

async function getFirstSheetTitle(accessToken, spreadsheetId) {
    if (process.env.GOOGLE_SHEET_TAB_NAME) return process.env.GOOGLE_SHEET_TAB_NAME

    const response = await googleFetch(
        `${SHEETS_API_URL}/${spreadsheetId}?fields=sheets(properties(title))`,
        accessToken
    )
    const data = await response.json()
    return data.sheets?.[0]?.properties?.title || 'Sheet1'
}

async function overwriteSheetRows(accessToken, spreadsheetId, sheetTitle, rows) {
    const clearRange = `${quoteSheetName(sheetTitle)}!A${START_ROW}:E`
    await googleFetch(
        `${SHEETS_API_URL}/${spreadsheetId}/values/${encodeURIComponent(clearRange)}:clear`,
        accessToken,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        }
    )

    if (rows.length === 0) return

    const updateRange = `${quoteSheetName(sheetTitle)}!A${START_ROW}:E${START_ROW + rows.length - 1}`
    await googleFetch(
        `${SHEETS_API_URL}/${spreadsheetId}/values/${encodeURIComponent(updateRange)}?valueInputOption=USER_ENTERED`,
        accessToken,
        {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ values: rows }),
        }
    )
}

async function shareSpreadsheetIfConfigured(accessToken, fileId) {
    const emails = (process.env.GOOGLE_SHEET_SHARE_EMAILS || '')
        .split(',')
        .map((email) => email.trim())
        .filter(Boolean)

    for (const email of emails) {
        await googleFetch(
            `${DRIVE_API_URL}/files/${fileId}/permissions?supportsAllDrives=true&sendNotificationEmail=false`,
            accessToken,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'user',
                    role: 'writer',
                    emailAddress: email,
                }),
            }
        )
    }
}

async function googleFetch(url, accessToken, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            ...(options.headers || {}),
            Authorization: `Bearer ${accessToken}`,
        },
    })

    if (!response.ok) {
        const data = await parseJsonResponse(response)
        console.error('Google API error:', data)
        throw publicError(response.status, data?.error?.message || 'Google API 요청에 실패했습니다.')
    }

    return response
}

function signJwt(payload) {
    const header = { alg: 'RS256', typ: 'JWT' }
    const encodedHeader = base64Url(JSON.stringify(header))
    const encodedPayload = base64Url(JSON.stringify(payload))
    const content = `${encodedHeader}.${encodedPayload}`
    const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n')
    const signature = crypto.createSign('RSA-SHA256').update(content).sign(privateKey)
    return `${content}.${base64Url(signature)}`
}

function base64Url(value) {
    const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value)
    return buffer
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '')
}

function quoteSheetName(name) {
    return `'${String(name).replace(/'/g, "''")}'`
}

function escapeDriveQueryValue(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
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
