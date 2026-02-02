//! Utility functions for text processing.

/// Truncate a string to max length with ellipsis.
pub fn truncate_str(s: &str, max_len: usize) -> String {
    if s.chars().count() <= max_len {
        s.to_string()
    } else {
        let truncated: String = s.chars().take(max_len.saturating_sub(1)).collect();
        format!("{}…", truncated)
    }
}

/// Word-wrap a string to fit within a given width.
pub fn word_wrap(s: &str, width: usize) -> Vec<String> {
    let mut lines = Vec::new();
    let mut current_line = String::new();

    for word in s.split_whitespace() {
        if current_line.is_empty() {
            // First word on the line
            if word.len() > width {
                // Word itself is too long, just add it (will be truncated by display)
                lines.push(word.to_string());
            } else {
                current_line = word.to_string();
            }
        } else if current_line.len() + 1 + word.len() <= width {
            // Word fits on current line
            current_line.push(' ');
            current_line.push_str(word);
        } else {
            // Word doesn't fit, start new line
            lines.push(current_line);
            if word.len() > width {
                lines.push(word.to_string());
                current_line = String::new();
            } else {
                current_line = word.to_string();
            }
        }
    }

    // Don't forget the last line
    if !current_line.is_empty() {
        lines.push(current_line);
    }

    if lines.is_empty() {
        lines.push(String::new());
    }

    lines
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_truncate_str() {
        assert_eq!(truncate_str("hello", 10), "hello");
        assert_eq!(truncate_str("hello world", 5), "hell…");
    }

    #[test]
    fn test_word_wrap() {
        let result = word_wrap("hello world foo bar", 10);
        assert_eq!(result, vec!["hello", "world foo", "bar"]);
    }

    #[test]
    fn test_word_wrap_empty() {
        let result = word_wrap("", 10);
        assert_eq!(result, vec![""]);
    }
}
