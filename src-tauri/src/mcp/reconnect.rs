pub fn backoff_ms(attempt: u32) -> u64 {
    let exp = attempt.min(8);
    500u64.saturating_mul(1u64 << exp)
}

pub fn should_retry(enabled: bool, attempt: u32, max_retries: u32) -> bool {
    enabled && attempt < max_retries
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exponential_backoff_is_bounded() {
        assert_eq!(backoff_ms(0), 500);
        assert_eq!(backoff_ms(1), 1000);
        assert_eq!(backoff_ms(2), 2000);
        assert!(backoff_ms(20) >= backoff_ms(8));
    }

    #[test]
    fn retry_stops_at_max() {
        assert!(should_retry(true, 0, 3));
        assert!(should_retry(true, 2, 3));
        assert!(!should_retry(true, 3, 3));
        assert!(!should_retry(false, 0, 3));
    }
}
