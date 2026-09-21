use serde::ser::{Serialize, Serializer};
use std::io;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("No project is currently open.")]
    NoProject,
    #[error("The requested path is outside the active project.")]
    PathOutsideProject,
    #[error("Command is not allowed by the current security policy.")]
    CommandDenied,
    #[error("Unable to read file.")]
    ReadFailed,
    #[error("Unable to save file.")]
    WriteFailed,
    #[error("Unable to start terminal.")]
    TerminalFailed,
    #[error("Project directory no longer exists.")]
    ProjectMissing,
    #[error("Unable to display this file as UTF-8.")]
    InvalidUtf8,
    #[error("Binary file")]
    BinaryFile,
    #[error("This file is too large to open in the editor.")]
    FileTooLarge,
    #[error("{0}")]
    InvalidRequest(String),
    #[error("{0}")]
    Io(String),
    #[error("{0}")]
    Database(String),
    #[error("{0}")]
    Rag(String),
}

impl From<rusqlite::Error> for AppError {
    fn from(error: rusqlite::Error) -> Self {
        AppError::Database(error.to_string())
    }
}

impl From<r2d2::Error> for AppError {
    fn from(error: r2d2::Error) -> Self {
        AppError::Database(error.to_string())
    }
}

impl From<io::Error> for AppError {
    fn from(error: io::Error) -> Self {
        match error.kind() {
            io::ErrorKind::NotFound => AppError::InvalidRequest("Unable to read file.".to_owned()),
            io::ErrorKind::InvalidData => AppError::InvalidUtf8,
            _ => AppError::Io(error.to_string()),
        }
    }
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
