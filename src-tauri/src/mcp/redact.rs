const SECRETISH: &[&str] = &["token", "secret", "password", "api_key", "apikey", "authorization"];

pub fn redact_text(value: &str) -> String {
    if looks_like_secret(value) {
        return "[redacted]".into();
    }
    value.to_string()
}

pub fn looks_like_secret(value: &str) -> bool {
    let trimmed = value.trim();
    trimmed.starts_with("ghp_")
        || trimmed.starts_with("github_pat_")
        || trimmed.starts_with("sk-")
        || trimmed.starts_with("xox")
}

pub fn key_is_secret(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    SECRETISH.iter().any(|item| lower.contains(item))
}

pub fn truncate_output(text: &str, max_chars: usize) -> (String, bool) {
    if text.chars().count() <= max_chars {
        return (text.to_string(), false);
    }
    let clipped: String = text.chars().take(max_chars).collect();
    (format!("{clipped}\n[output truncated]"), true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redacts_github_tokens() {
        assert_eq!(redact_text("ghp_abc"), "[redacted]");
        assert!(!looks_like_secret("search issues"));
        assert!(key_is_secret("GITHUB_TOKEN"));
    }
}
