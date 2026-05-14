export const ACTIVITY_TAGS = [
    '협동',
    '성실',
    '리더십',
    '배려',
    '도전',
    '기초체력',
    '기록 향상',
    '경기 전략',
]

const TAG_PREFIX_PATTERN = /^\[태그:\s*([^\]]*)\]\n?/

export function getLogTags(log) {
    if (Array.isArray(log?.tags)) {
        return log.tags.map((tag) => String(tag).trim()).filter(Boolean)
    }

    if (typeof log?.content !== 'string') return []

    const match = log.content.match(TAG_PREFIX_PATTERN)
    if (!match) return []

    return match[1].split(',').map((tag) => tag.trim()).filter(Boolean)
}

export function getLogContent(log) {
    if (typeof log?.content !== 'string') return ''
    return log.content.replace(TAG_PREFIX_PATTERN, '').trimStart()
}

export function shouldRetryWithoutTags(error) {
    if (!error) return false
    const message = `${error.code || ''} ${error.message || ''}`.toLowerCase()
    return message.includes('tags') || message.includes('schema cache')
}

export function buildTaggedContent(content, tags) {
    if (!tags.length) return content
    return `[태그: ${tags.join(', ')}]\n${content}`
}
