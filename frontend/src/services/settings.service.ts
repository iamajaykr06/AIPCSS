import api from '@/lib/axios'
import type { ScheduleSettings, ScheduleSettingsPayload, SchedulePreview } from '@/types'

// ── Schedule Settings ─────────────────────────────────────────────────────────

export const settingsService = {
    async getScheduleSettings(): Promise<ScheduleSettings> {
        const res = await api.get('/settings/schedule')
        return res.data
    },

    async updateScheduleSettings(payload: ScheduleSettingsPayload): Promise<{ message: string; settings: ScheduleSettings }> {
        const res = await api.put('/settings/schedule', payload)
        return res.data
    },

    async resetScheduleSettings(): Promise<{ message: string; settings: ScheduleSettings }> {
        const res = await api.post('/settings/schedule/reset')
        return res.data
    },

    async previewSchedule(settings?: ScheduleSettingsPayload): Promise<SchedulePreview> {
        const res = await api.post('/settings/schedule/preview', settings || {})
        return res.data
    },
}
