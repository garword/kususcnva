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
     * Get current Date object shifted to WIB (UTC+7).
     * WARNING: The 'time' value of this object will be WIB, but methods like getHours() 
     * might still be confused if system is not UTC. 
     * Best used for string formatting or relative comparison if both are shifted.
     */
    static nowWIB(): Date {
        const d = new Date();
        const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
        return new Date(utc + (3600000 * 7));
    }

    /**
     * Get current timestamp formatted as readable WIB string for Database
     * Format: "YYYY-MM-DD HH:mm:ss"
     */
    static getWIBISOString(): string {
        return this.nowWIB().toISOString().replace('T', ' ').substring(0, 19);
    }

    /**
     * Add days to current WIB date
     */
    static addDaysWIB(days: number): Date {
        const d = this.nowWIB();
        d.setDate(d.getDate() + days);
        return d;
    }
}
