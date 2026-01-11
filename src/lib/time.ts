export class TimeUtils {
    /**
     * Get current Date object (System Time / UTC).
     * Source of truth.
     */
    static now(): Date {
        return new Date();
    }

    /**
     * Get current timestamp formatted as readable WIB string
     * e.g. "10/01/2026 23.20.00 WIB"
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
        }).replace(/\./g, ':') + " WIB";
    }

    /**
     * Helper to get Current Date in WIB as a Date Object (with 00:00:00 time usually)
     * Useful for day comparisons.
     */
    static getWIBDate(): string {
        return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }); // YYYY-MM-DD
    }

    /**
     * Add days to current date
     */
    static addDays(days: number): Date {
        const d = new Date();
        d.setDate(d.getDate() + days);
        return d;
    }
}
