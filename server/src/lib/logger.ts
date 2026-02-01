/**
 * @fileoverview File-based logging for Glass.
 *
 * Provides a custom Effect logger that writes to a log file in the
 * project-specific data directory. Logs are written in a human-readable
 * format with timestamps, levels, and structured data.
 *
 * Log location: ~/.local/share/glass/<project-hash>/logs/glass.log
 */

import * as Fs from "node:fs";
import * as Path from "node:path";
import { Cause, type HashMap, Layer, type List, LogLevel, type LogSpan, Logger } from "effect";
import { getLogFilePath, getLogsDirectory } from "./project.js";

/**
 * Formats a Date as ISO 8601 string.
 */
const formatTimestamp = (date: Date): string => {
	return date.toISOString();
};

/**
 * Formats log level to a fixed-width string.
 */
const formatLevel = (level: LogLevel.LogLevel): string => {
	return level.label.padEnd(5);
};

/**
 * Formats annotations as key=value pairs.
 */
const formatAnnotations = (annotations: HashMap.HashMap<string, unknown>): string => {
	const pairs: string[] = [];
	for (const [key, value] of annotations) {
		pairs.push(`${key}=${JSON.stringify(value)}`);
	}
	return pairs.length > 0 ? ` ${pairs.join(" ")}` : "";
};

/**
 * Formats a Cause for logging.
 */
const formatCause = (cause: Cause.Cause<unknown>): string => {
	if (Cause.isEmpty(cause)) {
		return "";
	}
	return ` cause=${Cause.pretty(cause)}`;
};

/**
 * Formats spans as name=duration pairs.
 */
const formatSpans = (spans: List.List<LogSpan.LogSpan>): string => {
	const pairs: string[] = [];
	for (const span of spans) {
		const duration = Date.now() - span.startTime;
		pairs.push(`${span.label}=${duration}ms`);
	}
	return pairs.length > 0 ? ` spans=[${pairs.join(", ")}]` : "";
};

/**
 * Creates a file logger for the given project path.
 *
 * The logger writes formatted log entries to the log file, creating
 * the logs directory if it doesn't exist.
 *
 * @param projectPath - Absolute path to the project
 * @returns A Logger that writes to the project's log file
 */
export const createFileLogger = (projectPath: string): Logger.Logger<unknown, void> => {
	const logsDir = getLogsDirectory(projectPath);
	const logPath = getLogFilePath(projectPath);

	// Ensure logs directory exists
	Fs.mkdirSync(logsDir, { recursive: true });

	return Logger.make(({ logLevel, message, annotations, cause, date, spans }) => {
		// Format the log entry
		const timestamp = formatTimestamp(date);
		const level = formatLevel(logLevel);
		const messageStr = Array.isArray(message) ? message.join(" ") : String(message);
		const annotationsStr = formatAnnotations(annotations);
		const causeStr = formatCause(cause);
		const spansStr = formatSpans(spans);

		const entry = `${timestamp} [${level}] ${messageStr}${annotationsStr}${spansStr}${causeStr}\n`;

		// Append to log file synchronously (Effect logger is sync)
		try {
			Fs.appendFileSync(logPath, entry, "utf-8");
		} catch {
			// If we can't write to log file, fall back to stderr
			process.stderr.write(`[LOG WRITE ERROR] ${entry}`);
		}
	});
};

/**
 * Creates a Layer that configures file-based logging for a project.
 *
 * This layer:
 * - Creates the logs directory if needed
 * - Sets up a file logger that writes to glass.log
 * - Sets the minimum log level to Debug for comprehensive logging
 *
 * @param projectPath - Absolute path to the project
 * @returns Layer that provides file-based logging
 */
export const FileLoggerLive = (projectPath: string): Layer.Layer<never> => {
	const fileLogger = createFileLogger(projectPath);

	return Layer.merge(
		// Replace the default logger with our file logger
		Logger.replace(Logger.defaultLogger, fileLogger),
		// Set minimum log level to Debug
		Logger.minimumLogLevel(LogLevel.Debug),
	);
};

/**
 * Creates a Layer that logs to both file and a custom handler.
 *
 * Useful for debugging when you want logs in file plus some other output.
 *
 * @param projectPath - Absolute path to the project
 * @param additionalLogger - Additional logger to combine with file logger
 * @returns Layer that provides combined logging
 */
export const combinedLoggerLive = (
	projectPath: string,
	additionalLogger: Logger.Logger<unknown, void>,
): Layer.Layer<never> => {
	const fileLogger = createFileLogger(projectPath);
	const combined = Logger.zip(fileLogger, additionalLogger);

	return Layer.merge(
		Logger.replace(Logger.defaultLogger, combined),
		Logger.minimumLogLevel(LogLevel.Debug),
	);
};
