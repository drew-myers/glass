/**
 * @fileoverview Time formatting utilities.
 *
 * Provides functions for formatting dates as relative time strings
 * suitable for display in the TUI (e.g., "2h ago", "3 days ago").
 */

// =============================================================================
// Constants
// =============================================================================

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

// =============================================================================
// Public API
// =============================================================================

/**
 * Formats a date as a relative time string.
 *
 * @param date - The date to format
 * @param now - Optional reference date (defaults to current time)
 * @returns Relative time string like "2h ago", "3d ago", "1mo ago"
 *
 * @example
 * ```typescript
 * formatRelativeTime(new Date(Date.now() - 2 * 60 * 60 * 1000))
 * // => "2h ago"
 *
 * formatRelativeTime(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000))
 * // => "3d ago"
 * ```
 */
export const formatRelativeTime = (date: Date, now: Date = new Date()): string => {
	const diff = now.getTime() - date.getTime();

	// Handle future dates (shouldn't happen, but be safe)
	if (diff < 0) {
		return "just now";
	}

	// Less than a minute
	if (diff < MINUTE) {
		return "just now";
	}

	// Less than an hour - show minutes
	if (diff < HOUR) {
		const minutes = Math.floor(diff / MINUTE);
		return `${minutes}m ago`;
	}

	// Less than a day - show hours
	if (diff < DAY) {
		const hours = Math.floor(diff / HOUR);
		return `${hours}h ago`;
	}

	// Less than a week - show days
	if (diff < WEEK) {
		const days = Math.floor(diff / DAY);
		return `${days}d ago`;
	}

	// Less than a month - show weeks
	if (diff < MONTH) {
		const weeks = Math.floor(diff / WEEK);
		return `${weeks}w ago`;
	}

	// Less than a year - show months
	if (diff < YEAR) {
		const months = Math.floor(diff / MONTH);
		return `${months}mo ago`;
	}

	// More than a year - show years
	const years = Math.floor(diff / YEAR);
	return `${years}y ago`;
};

/**
 * Formats a date as a short relative time string without "ago".
 * Useful for compact displays.
 *
 * @param date - The date to format
 * @param now - Optional reference date (defaults to current time)
 * @returns Short relative time string like "2h", "3d", "1mo"
 */
export const formatRelativeTimeShort = (date: Date, now: Date = new Date()): string => {
	const full = formatRelativeTime(date, now);

	if (full === "just now") {
		return "now";
	}

	// Remove " ago" suffix
	return full.replace(" ago", "");
};
