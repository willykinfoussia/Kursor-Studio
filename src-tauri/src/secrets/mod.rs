use crate::error::{AppError, AppResult};
use std::{collections::HashMap, sync::Mutex};

const SERVICE: &str = "com.willy.kursor";
const ALLOWED_KEYS: &[&str] = &[
    "AI_GATEWAY_API_KEY",
    "GITHUB_ACCESS_TOKEN",
    "GITHUB_REFRESH_TOKEN",
];

fn is_allowed_key(key: &str) -> bool {
    ALLOWED_KEYS.contains(&key) || is_mcp_secret_key(key)
}

fn is_mcp_secret_key(key: &str) -> bool {
    let rest = match key.strip_prefix("mcp:") {
        Some(value) => value,
        None => return false,
    };
    let mut parts = rest.splitn(2, ':');
    matches!(
        (parts.next(), parts.next()),
        (Some(server), Some(env))
            if !server.is_empty()
                && server
                    .chars()
                    .all(|ch| ch.is_ascii_alphanumeric() || ch == '-')
                && !env.is_empty()
                && env
                    .chars()
                    .all(|ch| ch.is_ascii_alphanumeric() || ch == '_')
    )
}

#[derive(Default)]
pub struct SecretStore {
    values: Mutex<HashMap<String, String>>,
}

impl SecretStore {
    fn validate_key(key: &str) -> AppResult<()> {
        if is_allowed_key(key) {
            Ok(())
        } else {
            Err(AppError::InvalidRequest(
                "This secret key is not allowed".to_owned(),
            ))
        }
    }

    fn keyring_entry(key: &str) -> AppResult<keyring::Entry> {
        keyring::Entry::new(SERVICE, key).map_err(|error| {
            AppError::InvalidRequest(format!("Secure storage is unavailable: {error}"))
        })
    }

    pub fn get(&self, key: &str) -> AppResult<Option<String>> {
        Self::validate_key(key)?;
        if let Ok(entry) = Self::keyring_entry(key) {
            if let Ok(value) = entry.get_password() {
                if !value.trim().is_empty() {
                    return Ok(Some(value));
                }
            }
        }
        if let Some(value) = self
            .values
            .lock()
            .map_err(|_| AppError::InvalidRequest("Secret store is unavailable".to_owned()))?
            .get(key)
            .cloned()
        {
            if !value.trim().is_empty() {
                return Ok(Some(value));
            }
        }
        Ok(std::env::var(key)
            .ok()
            .filter(|value| !value.trim().is_empty()))
    }

    pub fn set(&self, key: &str, value: String) -> AppResult<()> {
        Self::validate_key(key)?;
        if value.trim().is_empty() {
            return Err(AppError::InvalidRequest(
                "Secret value cannot be empty".to_owned(),
            ));
        }
        if let Ok(entry) = Self::keyring_entry(key) {
            if entry.set_password(&value).is_err() {
                let _ = entry.delete_credential();
                let _ = entry.set_password(&value);
            }
        }
        self.values
            .lock()
            .map_err(|_| AppError::InvalidRequest("Secret store is unavailable".to_owned()))?
            .insert(key.to_owned(), value);
        Ok(())
    }

    pub fn delete(&self, key: &str) -> AppResult<()> {
        Self::validate_key(key)?;
        if let Ok(entry) = Self::keyring_entry(key) {
            let _ = entry.delete_credential();
        }
        self.values
            .lock()
            .map_err(|_| AppError::InvalidRequest("Secret store is unavailable".to_owned()))?
            .remove(key);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::{is_allowed_key, is_mcp_secret_key};

    #[test]
    fn allows_namespaced_mcp_keys() {
        assert!(is_mcp_secret_key("mcp:github:GITHUB_TOKEN"));
        assert!(is_allowed_key("mcp:github:GITHUB_TOKEN"));
        assert!(is_allowed_key("AI_GATEWAY_API_KEY"));
        assert!(!is_mcp_secret_key("mcp:github"));
        assert!(!is_allowed_key("RANDOM_SECRET"));
        assert!(!is_mcp_secret_key("mcp:git hub:TOKEN"));
    }
}
