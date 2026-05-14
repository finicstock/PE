export const ROLES = {
    STUDENT: 'student',
    MASTER_TEACHER: 'teacher',
    SUB_TEACHER: 'sub_teacher',
}

export function isTeacherRole(role) {
    return role === ROLES.MASTER_TEACHER || role === ROLES.SUB_TEACHER
}

export function isMasterAdmin(profile) {
    return profile?.role === ROLES.MASTER_TEACHER
}

export function getRoleLabel(role) {
    if (role === ROLES.MASTER_TEACHER) return '마스터관리자'
    if (role === ROLES.SUB_TEACHER) return '서브관리자'
    return '학생'
}

export function getRoleBadgeClass(role) {
    if (isTeacherRole(role)) return 'teacher-badge'
    return 'student-badge'
}
