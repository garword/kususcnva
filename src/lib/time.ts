export class TimeUtils {
    /**
     * Get current Jakarta Time (WIB) as a Date object.
     * This creates a Date object that effectively represents "now" in WIB context.
     * Note: The internal UTC timestamp will be shifted, so use this carefully with other libraries.
     * Best for display formatting and local interval calculations.
     */
    static now(): Date {
        // Create date with current instant
        const now = new Date();
        // Get UTC time in ms
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        // Add 7 hours (Western Indonesia Time)
        return new Date(utc + (3600000 * 7));
    }

    /**
     * Get current timestamp formatted as readable WIB string
     * e.g. "10/01/2026, 23:20:00"
     */
    static format(date: Date = new Date()): string {
        return date.toLocaleString('id-ID', {
            timeZone: 'Asia/Jakarta',
            hour12: false,
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    /**
     * Returns SQLite compatible string for NOW in WIB
     * Format: YYYY-MM-DD HH:MM:SS
     */
    static sqliteNow(): string {
        const d = this.now();
        const iso = d.toISOString(); // 2026-01-10T23:20:00.000Z (Shifted technically)
        // We want '2026-01-10 23:20:00'
        return iso.replace('T', ' ').substring(0, 19);
    }

    /**
     * Add days to current WIB time
     */
    static addDays(days: number): Date {
        const d = this.now();
        d.setDate(d.getDate() + days);
        return d;
    }
}
